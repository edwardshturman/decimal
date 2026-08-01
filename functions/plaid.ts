import {
  Configuration,
  CountryCode,
  type LinkTokenCreateRequest,
  PlaidApi,
  type PlaidError,
  PlaidEnvironments,
  Products,
  type RemovedTransaction,
  type Transaction as PlaidTransaction,
  WebhookType,
  SandboxItemFireWebhookRequestWebhookCodeEnum
} from "plaid"
import {
  createTransactionInDb,
  deleteTransactionFromDb,
  getTransactionFromDb,
  promotePendingTransactionInDb,
  updateTransactionInDb
} from "@/functions/db/transactions"
import { APP_NAME } from "@/lib/constants"
import { Transaction } from "@/generated/prisma/client"
import { planSyncOperations } from "@/functions/reconcile"
import { getAccountsFromDb } from "@/functions/db/accounts"
import { createCursor, getCursor, updateCursor } from "@/functions/db/cursors"

if (!process.env.PLAID_CLIENT_ID) {
  throw new Error("Missing env var PLAID_CLIENT_ID")
}
if (!process.env.PLAID_SECRET) {
  throw new Error("Missing env var PLAID_SECRET")
}

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID
const PLAID_SECRET = process.env.PLAID_SECRET
const PLAID_ENV = process.env.PLAID_ENV || "sandbox"
const PLAID_PRODUCTS = [Products.Transactions]
const PLAID_COUNTRY_CODES = [CountryCode.Us]

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
      "Plaid-Version": "2020-09-14"
    }
  }
})

const client = new PlaidApi(configuration)

/**
 * Plaid error codes warning that an Item's connection is *about* to lapse, rather than reporting one that already has.
 * An Item in either state keeps syncing normally until the deadline passes, so a successful sync says nothing about whether the warning still stands — only re-authenticating clears it.
 *
 * @see https://plaid.com/docs/errors/item
 */
const PENDING_ERROR_CODES = new Set([
  "PENDING_DISCONNECT",
  "PENDING_EXPIRATION"
])

/**
 * Plaid error codes describing an Item whose connection has gone stale, all of which the user can clear by re-authenticating through Link's update mode.
 *
 * Note that Sandbox Items enter `ITEM_LOGIN_REQUIRED` on their own, 30 days after being created.
 *
 * @see https://plaid.com/docs/errors/item
 */
const REAUTHENTICABLE_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  ...PENDING_ERROR_CODES
])

export function requiresReauthentication(plaidErrorCode: string | null) {
  if (!plaidErrorCode) return false
  return REAUTHENTICABLE_ERROR_CODES.has(plaidErrorCode)
}

/**
 * Whether a recorded error code is an advance warning rather than a failure.
 * A successful sync disproves a failure, but not one of these — see {@link PENDING_ERROR_CODES}.
 */
export function warnsOfPendingDisconnection(plaidErrorCode: string | null) {
  if (!plaidErrorCode) return false
  return PENDING_ERROR_CODES.has(plaidErrorCode)
}

/**
 * Plaid SDK calls reject with an Axios error carrying the {@link PlaidError} as its response body.
 * The Axios error itself only reports the status code, so anything wanting to know what actually went wrong has to unwrap it.
 *
 * @param error an error thrown by a Plaid SDK call
 * @returns the Plaid error, or `null` if the error did not come from Plaid
 */
export function getPlaidError(error: unknown) {
  const data = (error as { response?: { data?: Partial<PlaidError> } })
    ?.response?.data
  if (typeof data?.error_code !== "string") return null
  return data as PlaidError
}

/**
 * @param error an error thrown by a Plaid SDK call
 * @returns the Plaid `error_code`, e.g. `ITEM_LOGIN_REQUIRED`, or `null` if the error did not come from Plaid
 */
export function getPlaidErrorCode(error: unknown) {
  return getPlaidError(error)?.error_code ?? null
}

/**
 * Formats a Plaid error for logging, since the code alone rarely says enough to act on.
 */
export function describePlaidError(plaidError: PlaidError) {
  return `${plaidError.error_code}: ${plaidError.error_message}`
}

export async function createLinkToken(userId: string) {
  const webhookUrl =
    process.env.WEBHOOK_URL ||
    `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/webhooks/plaid`

  const linkTokenConfig: LinkTokenCreateRequest = {
    user: {
      client_user_id: userId
    },
    client_name: APP_NAME,
    products: PLAID_PRODUCTS,
    country_codes: PLAID_COUNTRY_CODES,
    language: "en",
    webhook: webhookUrl
  }

  console.log("[Plaid] Creating link token with webhook URL:", webhookUrl)
  const response = await client.linkTokenCreate(linkTokenConfig)
  return response.data
}

/**
 * Creates a Link token in update mode, used to re-authenticate an existing Item that Plaid has put into an error state, e.g. `ITEM_LOGIN_REQUIRED`.
 *
 * Update mode reuses the Item's existing access token, so there is no public token to exchange once Link succeeds.
 *
 * @param userId the ID of the user who owns the Item
 * @param accessToken the decrypted access token of the Item to repair
 * @see https://plaid.com/docs/link/update-mode
 */
export async function createUpdateModeLinkToken({
  userId,
  accessToken
}: {
  userId: string
  accessToken: string
}) {
  const linkTokenConfig: LinkTokenCreateRequest = {
    user: {
      client_user_id: userId
    },
    client_name: APP_NAME,
    country_codes: PLAID_COUNTRY_CODES,
    language: "en",
    access_token: accessToken
    // `products` is intentionally omitted; Plaid rejects it in update mode
    // `webhook` has no effect in update mode either — the Item keeps the webhook it was created with
  }

  console.log("[Plaid] Creating update mode link token")
  const response = await client.linkTokenCreate(linkTokenConfig)
  return response.data
}

export async function exchangePublicTokenForAccessToken(publicToken: string) {
  const response = await client.itemPublicTokenExchange({
    public_token: publicToken
  })

  const accessToken = response.data.access_token
  return accessToken
}

export async function getItemFromPlaid({
  accessToken
}: {
  accessToken: string
}) {
  const response = await client.itemGet({ access_token: accessToken })
  return response.data.item
}

export async function removeItemFromPlaid({
  accessToken
}: {
  accessToken: string
}) {
  const response = await client.itemRemove({ access_token: accessToken })
  return response.data.request_id
}

export async function getAccountsFromPlaid({
  accessToken
}: {
  accessToken: string
}) {
  const accountsResponse = await client.accountsGet({
    access_token: accessToken
  })
  return accountsResponse.data
}

function convertPlaidTransactionToDatabaseTransaction(
  plaidTransaction: PlaidTransaction
) {
  const newTransaction: Transaction = {
    name: plaidTransaction.original_description || plaidTransaction.name,
    id: plaidTransaction.transaction_id,
    accountId: plaidTransaction.account_id,
    currencyCode: plaidTransaction.iso_currency_code || "",
    amount: plaidTransaction.amount,
    date: new Date(plaidTransaction.authorized_date || plaidTransaction.date),
    pending: plaidTransaction.pending,
    pendingTransactionId: plaidTransaction.pending_transaction_id || null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
  return newTransaction
}

export async function syncTransactions(accessToken: string) {
  const item = await getItemFromPlaid({ accessToken })
  const accounts = await getAccountsFromDb({ itemId: item.item_id })
  for (const account of accounts) {
    const cursorEntry = await getCursor({ accountId: account.id })
    let cursor = cursorEntry?.string

    // Aggregate transactions since the last cursor
    let added: Transaction[] = []
    let modified: Transaction[] = []
    let removed: RemovedTransaction[] = []
    let hasMore = true

    while (hasMore) {
      const transactions = await client.transactionsSync({
        access_token: accessToken,
        cursor,
        options: {
          account_id: account.id,
          include_original_description: true
        }
      })
      const data = transactions.data

      added = added.concat(
        data.added.map(convertPlaidTransactionToDatabaseTransaction)
      )
      modified = modified.concat(
        data.modified.map(convertPlaidTransactionToDatabaseTransaction)
      )
      removed = removed.concat(data.removed)
      hasMore = data.has_more
      cursor = data.next_cursor
    }

    // Determine which pending transactions referenced by posted (added) transactions are still stored, so a pending → posted transition can be promoted rather than recreated
    const storedPendingIds = new Set<string>()
    for (const addedTransaction of added) {
      const pendingId = addedTransaction.pendingTransactionId
      if (!pendingId) continue
      const existing = await getTransactionFromDb({ transactionId: pendingId })
      if (existing) storedPendingIds.add(pendingId)
    }

    // Update database entries
    // TODO: Promise.all() or something to ensure atomicity
    const operations = planSyncOperations({
      added,
      modified,
      removed: removed.map((transaction) => transaction.transaction_id),
      storedPendingIds
    })
    for (const operation of operations) {
      switch (operation.type) {
        case "delete":
          await deleteTransactionFromDb({
            transactionId: operation.transactionId
          })
          break
        case "update":
          await updateTransactionInDb({ transaction: operation.transaction })
          break
        case "create":
          await createTransactionInDb({ transaction: operation.transaction })
          break
        case "promote":
          await promotePendingTransactionInDb({
            pendingId: operation.pendingId,
            postedTransaction: operation.postedTransaction
          })
          break
      }
    }

    // Save the most recent cursor
    if (cursor === undefined) {
      // `data.next_cursor` is always a string and the loop runs at least once
      throw new Error("Cursor should not be undefined")
    }
    if (!cursorEntry) {
      await createCursor({ accountId: account.id, string: cursor })
    } else {
      await updateCursor({ accountId: account.id, string: cursor })
    }
  }
}

export async function fireTestWebhook({
  accessToken
}: {
  accessToken: string
}) {
  const fireWebhookResponse = await client.sandboxItemFireWebhook({
    access_token: accessToken,
    webhook_type: WebhookType.Transactions,
    webhook_code:
      SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable
  })

  console.log(
    "[Plaid] Fire webhook response:",
    JSON.stringify(fireWebhookResponse.data, null, 2)
  )
  return fireWebhookResponse.data
}

/**
 * Forces a Sandbox Item into the `ITEM_LOGIN_REQUIRED` state, so the update mode flow can be tested without waiting for the Item to expire on its own.
 * Sandbox only.
 *
 * @see https://plaid.com/docs/api/sandbox/#sandboxitemreset_login
 */
export async function resetSandboxItemLogin({
  accessToken
}: {
  accessToken: string
}) {
  const response = await client.sandboxItemResetLogin({
    access_token: accessToken
  })
  return response.data
}

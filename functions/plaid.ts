import {
  Configuration,
  CountryCode,
  type LinkTokenCreateRequest,
  PlaidApi,
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
import { rethrowRedactedPlaidError } from "@/functions/plaid-errors"

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

/**
 * Raw Plaid errors carry the secret and access token in plain text, so never let one escape this file — end every call in `.catch(rethrowRedactedPlaidError)`.
 * @see PlaidRequestError
 */
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
  const response = await client
    .linkTokenCreate(linkTokenConfig)
    .catch(rethrowRedactedPlaidError)
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
  const response = await client
    .linkTokenCreate(linkTokenConfig)
    .catch(rethrowRedactedPlaidError)
  return response.data
}

export async function exchangePublicTokenForAccessToken(publicToken: string) {
  const response = await client
    .itemPublicTokenExchange({
      public_token: publicToken
    })
    .catch(rethrowRedactedPlaidError)

  const accessToken = response.data.access_token
  return accessToken
}

export async function getItemFromPlaid({
  accessToken
}: {
  accessToken: string
}) {
  const response = await client
    .itemGet({ access_token: accessToken })
    .catch(rethrowRedactedPlaidError)
  return response.data.item
}

export async function removeItemFromPlaid({
  accessToken
}: {
  accessToken: string
}) {
  const response = await client
    .itemRemove({ access_token: accessToken })
    .catch(rethrowRedactedPlaidError)
  return response.data.request_id
}

export async function getAccountsFromPlaid({
  accessToken
}: {
  accessToken: string
}) {
  const accountsResponse = await client
    .accountsGet({
      access_token: accessToken
    })
    .catch(rethrowRedactedPlaidError)
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
    reviewedAt: null,
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
      const transactions = await client
        .transactionsSync({
          access_token: accessToken,
          cursor,
          options: {
            account_id: account.id,
            include_original_description: true
          }
        })
        .catch(rethrowRedactedPlaidError)
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
  const fireWebhookResponse = await client
    .sandboxItemFireWebhook({
      access_token: accessToken,
      webhook_type: WebhookType.Transactions,
      webhook_code:
        SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable
    })
    .catch(rethrowRedactedPlaidError)

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
  const response = await client
    .sandboxItemResetLogin({
      access_token: accessToken
    })
    .catch(rethrowRedactedPlaidError)
  return response.data
}

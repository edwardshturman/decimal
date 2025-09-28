import {
  Configuration,
  CountryCode,
  type LinkTokenCreateRequest,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type RemovedTransaction,
  type Transaction as PlaidTransaction
} from "plaid"
import {
  createTransactionInDb,
  deleteTransactionFromDb,
  updateTransactionInDb
} from "@/functions/db/transactions"
import { APP_NAME } from "@/lib/constants"
import { Transaction } from "@/generated/prisma"
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

export async function createLinkToken(userId: string) {
  const linkTokenConfig: LinkTokenCreateRequest = {
    user: {
      client_user_id: userId
    },
    client_name: APP_NAME,
    products: PLAID_PRODUCTS,
    country_codes: PLAID_COUNTRY_CODES,
    language: "en"
  }

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
    // TODO: use pending_transaction_id
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

    // Update database entries
    // TODO: Promise.all() or something to ensure atomicity
    const removedIds = removed.map((transaction) => transaction.transaction_id)
    for (const id of removedIds) {
      await deleteTransactionFromDb({ transactionId: id })
    }
    for (const modifiedTransaction of modified) {
      await updateTransactionInDb({ transaction: modifiedTransaction })
    }
    for (const addedTransaction of added) {
      await createTransactionInDb({ transaction: addedTransaction })
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

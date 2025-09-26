import prisma from "@/functions/db"
import { getItemsFromDb } from "@/functions/db/items"
import { getAccountsFromDb } from "@/functions/db/accounts"
import { decryptAccessToken } from "@/functions/crypto/utils"
import type { Account, Transaction } from "@/generated/prisma"
import { getAccountsFromPlaid, syncTransactions } from "@/functions/plaid"

export async function getTransactionsFromDb({
  accountId
}: {
  accountId: string
}) {
  return await prisma.transaction.findMany({
    where: { accountId }
  })
}

export async function deleteTransactionFromDb({
  transactionId
}: {
  transactionId: string
}) {
  return await prisma.transaction.deleteMany({
    where: { id: transactionId }
  })
}

export async function updateTransactionInDb({
  transaction
}: {
  transaction: Transaction
}) {
  return await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      name: transaction.name,
      amount: transaction.amount,
      date: transaction.date,
      pending: transaction.pending,
      updatedAt: new Date()
    }
  })
}

export async function createTransactionInDb({
  transaction
}: {
  transaction: Transaction
}) {
  const existingTransaction = await prisma.transaction.findUnique({
    where: { id: transaction.id }
  })
  if (existingTransaction) {
    return existingTransaction
  }

  return await prisma.transaction.create({
    data: {
      accountId: transaction.accountId,
      id: transaction.id,
      name: transaction.name,
      date: transaction.date,
      amount: transaction.amount,
      currencyCode: transaction.currencyCode,
      pending: transaction.pending
    }
  })
}

export async function getAccountsAndTransactionsFromDb({
  userId
}: {
  userId: string
}) {
  const accounts: Account[] = []
  const transactions: Transaction[] = []
  const userItems = await getItemsFromDb({ userId })
  const encryptionKey = process.env.KEY_IN_USE!
  const keyVersion = process.env.KEY_VERSION!
  for (const item of userItems) {
    const encryptedAccessToken = item.accessToken
    const { plainText: accessToken } = decryptAccessToken(
      encryptedAccessToken,
      encryptionKey,
      keyVersion
    )

    // Sync transactions from Plaid → db, across all accounts for the given Item
    await syncTransactions(accessToken)

    // Add accounts for the given Item to user's available accounts for filtering
    const itemAccounts = await getAccountsFromDb({ itemId: item.id })
    accounts.push(...itemAccounts)

    // Aggregate transactions across Item accounts for rendering
    const { accounts: accountsFromItem } = await getAccountsFromPlaid({
      accessToken
    })
    for (const account of accountsFromItem) {
      const accountTransactions = await getTransactionsFromDb({
        accountId: account.account_id
      })
      transactions.push(...accountTransactions)
    }
  }

  return { accounts, transactions }
}

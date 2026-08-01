import prisma from "@/functions/db"
import { getItemsFromDb } from "@/functions/db/items"
import { getAccountsFromDb } from "@/functions/db/accounts"
import type { Account, Transaction } from "@/generated/prisma/client"

export async function getTransactionsFromDb({
  accountId
}: {
  accountId: string
}) {
  return await prisma.transaction.findMany({
    where: { accountId },
    include: { overrides: true }
  })
}

export async function getTransactionFromDb({
  transactionId
}: {
  transactionId: string
}) {
  return await prisma.transaction.findUnique({
    where: { id: transactionId }
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

export async function promotePendingTransactionInDb({
  pendingId,
  postedTransaction
}: {
  pendingId: string
  postedTransaction: Transaction
}) {
  return await prisma.transaction.update({
    where: { id: pendingId },
    data: {
      id: postedTransaction.id,
      name: postedTransaction.name,
      amount: postedTransaction.amount,
      date: postedTransaction.date,
      pending: postedTransaction.pending,
      currencyCode: postedTransaction.currencyCode,
      pendingTransactionId: postedTransaction.pendingTransactionId,
      updatedAt: new Date()
    }
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
  for (const item of userItems) {
    // Add accounts for the given Item to user's available accounts for filtering
    const itemAccounts = await getAccountsFromDb({ itemId: item.id })
    accounts.push(...itemAccounts)

    // Aggregate transactions across Item accounts for rendering
    // Transactions are only ever stored against Accounts we have in the database, so these are read from there rather than from Plaid — rendering the inbox shouldn't depend on a live call, nor on every Item being in a healthy state
    for (const account of itemAccounts) {
      const accountTransactions = await getTransactionsFromDb({
        accountId: account.id
      })

      // Resolve the user's overrides (e.g. a rename) into the displayed fields, keeping the Plaid-sourced values as the fallback
      const resolved = accountTransactions.map(
        ({ overrides, ...transaction }) => ({
          ...transaction,
          name: overrides?.name ?? transaction.name
        })
      )
      transactions.push(...resolved)
    }
  }

  return { accounts, transactions }
}

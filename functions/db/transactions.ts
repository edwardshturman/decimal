import prisma from "@/functions/db"
import { getItemsFromDb } from "@/functions/db/items"
import { getAccountsFromDb } from "@/functions/db/accounts"
import { modificationRequiresReview } from "@/functions/reconcile"
import type { Account, Transaction } from "@/generated/prisma/client"

export async function getUnreviewedTransactionsFromDb({
  accountId
}: {
  accountId: string
}) {
  return await prisma.transaction.findMany({
    where: { accountId, reviewedAt: null },
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
      // Posting can change what was reviewed (e.g. a tip added to the amount), so it always goes back to the Inbox
      reviewedAt: null,
      updatedAt: new Date()
    }
  })
}

export async function updateTransactionInDb({
  transaction
}: {
  transaction: Transaction
}) {
  const storedTransaction = await prisma.transaction.findUnique({
    where: { id: transaction.id }
  })
  const requiresReview =
    storedTransaction !== null &&
    modificationRequiresReview({
      stored: storedTransaction,
      modified: transaction
    })

  return await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      name: transaction.name,
      amount: transaction.amount,
      date: transaction.date,
      pending: transaction.pending,
      // Leaving `reviewedAt` undefined keeps its stored value
      reviewedAt: requiresReview ? null : undefined,
      updatedAt: new Date()
    }
  })
}

/**
 * Marks a user's transactions as reviewed, removing them from the Inbox.
 * Transactions the user doesn't own are skipped, as are ones already reviewed, which keep their original `reviewedAt`.
 *
 * @returns the number of transactions marked as reviewed
 */
export async function markTransactionsReviewedInDb({
  userId,
  transactionIds
}: {
  userId: string
  transactionIds: string[]
}) {
  const { count } = await prisma.transaction.updateMany({
    where: {
      id: { in: transactionIds },
      reviewedAt: null,
      account: { item: { userId } }
    },
    data: { reviewedAt: new Date() }
  })
  return count
}

/**
 * Marks a user's transactions as unreviewed, returning them to the Inbox.
 * Transactions the user doesn't own are skipped.
 *
 * @returns the number of transactions marked as unreviewed
 */
export async function markTransactionsUnreviewedInDb({
  userId,
  transactionIds
}: {
  userId: string
  transactionIds: string[]
}) {
  const { count } = await prisma.transaction.updateMany({
    where: {
      id: { in: transactionIds },
      reviewedAt: { not: null },
      account: { item: { userId } }
    },
    data: { reviewedAt: null }
  })
  return count
}

/**
 * Marks every one of a user's transactions as unreviewed.
 * Development only, for getting transactions back into the Inbox after testing reviews.
 *
 * @returns the number of transactions marked as unreviewed
 */
export async function resetReviewStatusInDb({ userId }: { userId: string }) {
  const { count } = await prisma.transaction.updateMany({
    where: {
      reviewedAt: { not: null },
      account: { item: { userId } }
    },
    data: { reviewedAt: null }
  })
  return count
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
      // Reviewed transactions have left the Inbox, so only unreviewed ones are fetched
      const accountTransactions = await getUnreviewedTransactionsFromDb({
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

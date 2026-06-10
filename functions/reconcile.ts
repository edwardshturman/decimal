import type { Transaction } from "@/generated/prisma/client"

export type SyncOperation =
  | { type: "delete"; transactionId: string }
  | { type: "update"; transaction: Transaction }
  | { type: "create"; transaction: Transaction }
  | { type: "promote"; pendingId: string; postedTransaction: Transaction }

/*
 * Given a set of added, modified, and/or removed transactions, as well as a set of IDs referencing pending transactions already stored, decide what to do with each.
 *
 * This is helpful for reconciling pending → posted transactions:
 * When a pending transaction posts, Plaid removes the pending transaction, and adds a new posted transaction, whose `pendingTransactionId` points to the removed pending transaction's `id`.
 * In such cases, "promote" the existing transaction by re-pointing its `id` to the posted `id`, rather than delete-then-create. By doing so, overrides by the user, such as renames, persist.
 */
export function planSyncOperations({
  added,
  modified,
  removed,
  storedPendingIds
}: {
  added: Transaction[]
  modified: Transaction[]
  removed: string[]
  storedPendingIds: Set<string>
}): SyncOperation[] {
  const operations: SyncOperation[] = []

  const pendingIdsToPromote = new Set(
    added
      .map((transaction) => transaction.pendingTransactionId)
      .filter((id): id is string => Boolean(id))
  )
  for (const transactionId of removed) {
    if (pendingIdsToPromote.has(transactionId)) continue
    operations.push({ type: "delete", transactionId })
  }

  for (const transaction of modified) {
    operations.push({ type: "update", transaction })
  }

  for (const transaction of added) {
    if (
      transaction.pendingTransactionId &&
      storedPendingIds.has(transaction.pendingTransactionId)
    ) {
      operations.push({
        type: "promote",
        pendingId: transaction.pendingTransactionId,
        postedTransaction: transaction
      })
    } else {
      operations.push({ type: "create", transaction })
    }
  }

  return operations
}

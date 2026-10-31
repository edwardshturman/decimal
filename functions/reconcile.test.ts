import { describe, expect, test } from "bun:test"
import {
  modificationRequiresReview,
  planSyncOperations
} from "@/functions/reconcile"
import type { Transaction } from "@/generated/prisma/client"

function makeTransaction(
  overrides: Partial<Transaction> & { id: string }
): Transaction {
  return {
    accountId: "account-1",
    currencyCode: "USD",
    amount: 10,
    date: new Date("2026-01-01"),
    name: "Coffee",
    pending: false,
    pendingTransactionId: null,
    reviewedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides
  }
}

describe("planSyncOperations", () => {
  test("pending → posted promotes the existing row instead of delete + create", () => {
    const posted = makeTransaction({
      id: "posted-1",
      pending: false,
      pendingTransactionId: "pending-1"
    })

    const operations = planSyncOperations({
      added: [posted],
      modified: [],
      removed: ["pending-1"],
      storedPendingIds: new Set(["pending-1"])
    })

    expect(operations).toEqual([
      { type: "promote", pendingId: "pending-1", postedTransaction: posted }
    ])
    // The pending ID must not be deleted, and no new posted txn should be created
    expect(operations.some((op) => op.type === "delete")).toBe(false)
    expect(operations.some((op) => op.type === "create")).toBe(false)
  })

  test("a standard removal is deleted", () => {
    const operations = planSyncOperations({
      added: [],
      modified: [],
      removed: ["gone-1"],
      storedPendingIds: new Set()
    })

    expect(operations).toEqual([{ type: "delete", transactionId: "gone-1" }])
  })

  test("a brand-new pending transaction is created", () => {
    const pending = makeTransaction({
      id: "pending-2",
      pending: true,
      pendingTransactionId: null
    })

    const operations = planSyncOperations({
      added: [pending],
      modified: [],
      removed: [],
      storedPendingIds: new Set()
    })

    expect(operations).toEqual([{ type: "create", transaction: pending }])
  })

  test("a brand-new posted transaction is created", () => {
    const posted = makeTransaction({
      id: "posted-2",
      pending: false,
      pendingTransactionId: null
    })

    const operations = planSyncOperations({
      added: [posted],
      modified: [],
      removed: [],
      storedPendingIds: new Set()
    })

    expect(operations).toEqual([{ type: "create", transaction: posted }])
  })

  test("a posted transaction whose pending row was never stored is created, not promoted", () => {
    const posted = makeTransaction({
      id: "posted-3",
      pendingTransactionId: "pending-unknown"
    })

    const operations = planSyncOperations({
      added: [posted],
      modified: [],
      removed: ["pending-unknown"],
      // Pending txn was never stored, so it is not in storedPendingIds
      storedPendingIds: new Set()
    })

    // The removed pending txn that would otherwise be removed is instead a no-op
    expect(operations).toEqual([{ type: "create", transaction: posted }])
  })

  test("modified transactions are updated by the same id", () => {
    const modified = makeTransaction({ id: "modified-1", amount: 99 })

    const operations = planSyncOperations({
      added: [],
      modified: [modified],
      removed: [],
      storedPendingIds: new Set()
    })

    expect(operations).toEqual([{ type: "update", transaction: modified }])
  })
})

describe("modificationRequiresReview", () => {
  const stored = makeTransaction({
    id: "transaction-1",
    reviewedAt: new Date("2026-01-02")
  })

  test("Plaid changing the name requires review", () => {
    const modified = makeTransaction({ id: "transaction-1", name: "Tea" })
    expect(modificationRequiresReview({ stored, modified })).toBe(true)
  })

  test("Plaid changing the amount requires review", () => {
    const modified = makeTransaction({ id: "transaction-1", amount: 12.5 })
    expect(modificationRequiresReview({ stored, modified })).toBe(true)
  })

  test("Plaid changing the date requires review", () => {
    const modified = makeTransaction({
      id: "transaction-1",
      date: new Date("2026-01-03")
    })
    expect(modificationRequiresReview({ stored, modified })).toBe(true)
  })

  test("a modification to nothing we store does not require review", () => {
    // e.g. Plaid enriching the transaction's category, which isn't stored
    const modified = makeTransaction({ id: "transaction-1" })
    expect(modificationRequiresReview({ stored, modified })).toBe(false)
  })
})

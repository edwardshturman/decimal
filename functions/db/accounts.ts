import prisma from "@/functions/db"
import { removeItemFromPlaid } from "@/functions/plaid"
import { deleteItemFromDb } from "@/functions/db/items"
import { decryptAccessToken } from "@/functions/crypto/utils"

type CreateAccountInput = {
  id: string
  name: string
  mask?: string
  itemId: string
}

export async function createAccountInDb(accountInput: CreateAccountInput) {
  return await prisma.account.create({
    data: {
      id: accountInput.id,
      name: accountInput.name,
      mask: accountInput.mask,
      itemId: accountInput.itemId
    }
  })
}

/**
 * Attempts to find one of a user's Accounts at a given institution by name and mask, as provided by Plaid.
 *
 * Name and mask are only meaningful within a single user's Items at a single institution — two users (or two banks) can easily share a "Plaid Checking" ending in "0000", so the match must never cross those boundaries.
 *
 * @param userId the ID of the user whose Accounts to search
 * @param institutionId the Plaid institution ID the Account's Item is linked to
 * @param name Account name, e.g. "Discover it Card"
 * @param mask Account mask, e.g. "1234"; `null` matches only Accounts without a mask
 * @returns an Account entry from the database if found, `null` otherwise
 */
export async function matchUserAccountFromDb({
  userId,
  institutionId,
  name,
  mask
}: {
  userId: string
  institutionId: string
  name: string
  mask: string | null
}) {
  return await prisma.account.findFirst({
    where: {
      name,
      mask,
      item: { userId, institutionId }
    }
  })
}

export async function getAccountFromDb({ accountId }: { accountId: string }) {
  return await prisma.account.findUnique({
    where: { id: accountId }
  })
}

export async function getAccountsFromDb({ itemId }: { itemId: string }) {
  return await prisma.account.findMany({
    where: { itemId }
  })
}

export async function deleteAccountFromDb({
  accountId
}: {
  accountId: string
}) {
  console.log("Deleting account " + accountId)
  const account = await prisma.account.findUnique({
    where: { id: accountId }
  })
  if (!account) return

  const associatedItem = await prisma.item.findUniqueOrThrow({
    where: { id: account.itemId },
    include: { accounts: true }
  })

  await prisma.transaction.deleteMany({
    where: { accountId }
  })
  console.log("Deleted transactions")

  await prisma.cursor.deleteMany({
    where: { accountId }
  })
  console.log("Deleted cursors")

  await prisma.account.delete({
    where: { id: accountId }
  })
  console.log("Deleted account")

  if (associatedItem.accounts.length === 1) {
    console.log(
      "Account was the only one associated with the Item, deleting Item"
    )
    const encryptedAccessToken = associatedItem.accessToken
    const encryptionKey = process.env.KEY_IN_USE!
    const { plainText: accessToken } = decryptAccessToken(
      encryptedAccessToken,
      encryptionKey,
      associatedItem.encryptionKeyVersion
    )
    console.log("Removing Item from Plaid...")
    await removeItemFromPlaid({ accessToken })
    console.log("Removed Item from Plaid")
    await deleteItemFromDb({ itemId: associatedItem.id })
    console.log("Deleted Item from database")
  }
}

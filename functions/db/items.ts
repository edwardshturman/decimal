import prisma from "@/functions/db"
import { getAccountsFromPlaid } from "@/functions/plaid"
import { getAccountFromDb } from "@/functions/db/accounts"

type CreateItemInput = {
  id: string
  userId: string
  accessToken: string
  encryptionKeyVersion: string
  institutionId: string
}

export async function getItemFromDb({ itemId }: { itemId: string }) {
  return await prisma.item.findUnique({
    where: { id: itemId }
  })
}

export async function getItemsFromDb({ userId }: { userId: string }) {
  return await prisma.item.findMany({
    where: { userId }
  })
}

/**
 * Matches a given new Item against existing institutions linked across a user's Items.
 * If all Accounts from the new Item exist in the database already, the new Item is designated as redundant, and is not created in the database.
 * The caller of this function should remove the new Item from Plaid.
 *
 * @param itemInput an object containing information about the new Item, and the user attempting to create it
 * @returns `true` if redundant, `false` otherwise
 */
export async function checkForRedundantItem(itemInput: CreateItemInput) {
  let isDuplicate = true
  const existingUserItems = await getItemsFromDb({ userId: itemInput.userId })
  const accountsUserWantsToAdd = (
    await getAccountsFromPlaid({
      accessToken: itemInput.accessToken
    })
  ).accounts

  for (const item of existingUserItems) {
    if (item.institutionId !== itemInput.institutionId) continue
    for (const account of accountsUserWantsToAdd) {
      const accountExistsInDb = await getAccountFromDb({
        accountId: account.account_id
      })
      if (!accountExistsInDb) isDuplicate = false
    }
  }

  return isDuplicate
}

/**
 * Creates an Item in the database.
 * Does not run redundancy checks.
 *
 * @see {@link checkForRedundantItem} for redundancy logic.
 * @param itemInput an object containing information about the new Item, and the user creating it
 * @returns the created Item object
 */
export async function createItemInDb(itemInput: CreateItemInput) {
  return await prisma.item.create({
    data: {
      id: itemInput.id,
      userId: itemInput.userId,
      accessToken: itemInput.accessToken,
      encryptionKeyVersion: itemInput.encryptionKeyVersion,
      institutionId: itemInput.institutionId
    }
  })
}

/**
 * Deletes an Item from the database, including all associated Accounts and Transactions.
 * Does NOT remove the Item from Plaid!
 *
 * @param itemId the ID of the Item to delete from the database
 * @returns the deleted Item
 */
export async function deleteItemFromDb({ itemId }: { itemId: string }) {
  console.log("Deleting Item " + itemId)
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { accounts: true }
  })
  if (!item) return

  for (const account of item.accounts) {
    await prisma.transaction.deleteMany({
      where: { accountId: account.id }
    })
    await prisma.cursor.deleteMany({
      where: { accountId: account.id }
    })
  }
  console.log("Deleted associated Transactions and Cursors across all Accounts")

  await prisma.account.deleteMany({
    where: { itemId }
  })
  console.log("Deleted all associated Accounts")

  console.log("Deleting Item... check calling function for success")
  return await prisma.item.delete({
    where: { id: itemId }
  })
}

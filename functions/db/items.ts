import prisma from "@/functions/db"
import type { AccountBase } from "plaid"
import { matchUserAccountFromDb } from "@/functions/db/accounts"

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
 * Matches a given new Item against the Items a user has already linked at the same institution.
 * If all Accounts from the new Item exist in the database already, the new Item is designated as redundant, and is not created in the database.
 * The caller of this function should remove the new Item from Plaid.
 *
 * @param userId the ID of the user attempting to create the new Item
 * @param institutionId the Plaid institution ID of the new Item
 * @param accounts the new Item's Accounts, as returned by Plaid
 * @returns `true` if redundant, `false` otherwise
 */
export async function checkForRedundantItem({
  userId,
  institutionId,
  accounts
}: {
  userId: string
  institutionId: string
  accounts: AccountBase[]
}) {
  for (const account of accounts) {
    console.log(
      `Examining Account user wants to add: ${account.name} ${account.mask}`
    )
    const accountExistsInDb = await matchUserAccountFromDb({
      userId,
      institutionId,
      name: account.name,
      mask: account.mask
    })
    if (!accountExistsInDb) {
      console.log(
        "Account does not exist in the database; Item is not redundant"
      )
      return false
    }
  }

  console.log(`Redundant Item for institution ${institutionId}`)
  return true
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
 * Records the Plaid error an Item is currently in, e.g. `ITEM_LOGIN_REQUIRED`, so it can be surfaced to the user for re-authentication.
 *
 * @param itemId the ID of the Item to update
 * @param plaidErrorCode the Plaid `error_code`, or `null` to mark the Item healthy again
 * @returns the updated Item object
 */
export async function setItemPlaidErrorCodeInDb({
  itemId,
  plaidErrorCode
}: {
  itemId: string
  plaidErrorCode: string | null
}) {
  return await prisma.item.update({
    where: { id: itemId },
    data: { plaidErrorCode }
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

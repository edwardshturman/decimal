import prisma from "@/functions/db"

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

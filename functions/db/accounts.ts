import prisma from "@/functions/db"
import { removeItem } from "@/functions/plaid"
import { deleteItem } from "@/functions/db/items"
import { decryptAccessToken } from "@/functions/crypto/utils"

type CreateAccountInput = {
  id: string
  name: string
  mask?: string
  itemId: string
}

export async function createAccount(accountInput: CreateAccountInput) {
  return await prisma.account.create({
    data: {
      id: accountInput.id,
      name: accountInput.name,
      mask: accountInput.mask,
      itemId: accountInput.itemId
    }
  })
}

export async function getAccount(accountId: string) {
  return await prisma.account.findUnique({
    where: { id: accountId }
  })
}

export async function getAccountsByItemId(itemId: string) {
  return await prisma.account.findMany({
    where: { itemId }
  })
}

export async function deleteAccount(accountId: string) {
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
    await removeItem(accessToken)
    console.log("Removed Item from Plaid")
    await deleteItem(associatedItem.id)
    console.log("Deleted Item from database")
  }
}

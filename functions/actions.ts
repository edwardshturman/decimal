"use server"

// Functions
import {
  exchangePublicTokenForAccessToken,
  getAccountsFromPlaid
} from "@/functions/plaid"
import {
  createAccountInDb,
  deleteAccountFromDb,
  getAccountFromDb
} from "@/functions/db/accounts"
import { revalidatePath } from "next/cache"
import { encryptAccessToken } from "@/functions/crypto/utils"
import { createItemInDb, getItemFromDb } from "@/functions/db/items"

export async function exchangePublicTokenForAccessTokenServerAction(
  userId: string,
  publicToken: string
) {
  const accessToken = await exchangePublicTokenForAccessToken(publicToken)

  // Add the Item to the database
  const { item, accounts } = await getAccountsFromPlaid({ accessToken })

  const encryptionKey = process.env.KEY_IN_USE!
  const keyVersion = process.env.KEY_VERSION!

  const { cipherText: encryptedAccessToken, keyVersion: encryptionKeyVersion } =
    encryptAccessToken(accessToken, encryptionKey, keyVersion)

  await createItemInDb({
    id: item.item_id,
    userId,
    accessToken: encryptedAccessToken,
    encryptionKeyVersion,
    institutionName: item.institution_name || ""
  })

  // Add each account associated with the Item to the database
  for (const account of accounts) {
    await createAccountInDb({
      id: account.account_id,
      itemId: item.item_id,
      name: account.name,
      mask: account.mask || undefined
    })
  }
}

export async function deleteAccountServerAction(formData: FormData) {
  const rawFormData = {
    userId: formData.get("userId")?.toString(),
    accountId: formData.get("accountId")?.toString()
  }
  const { userId, accountId } = rawFormData
  if (!userId || !accountId) return

  const account = await getAccountFromDb({ accountId })
  if (!account) return

  const associatedItem = await getItemFromDb({ itemId: account.itemId })
  if (!associatedItem) return

  if (associatedItem.userId !== userId) return

  await deleteAccountFromDb({ accountId })
  revalidatePath("/settings")
}

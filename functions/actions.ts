"use server"

// Functions
import {
  exchangePublicTokenForAccessToken,
  getAccounts
} from "@/functions/plaid"
import {
  createAccount,
  deleteAccount,
  getAccount
} from "@/functions/db/accounts"
import { revalidatePath } from "next/cache"
import { createItem, getItem } from "@/functions/db/items"
import { encryptAccessToken } from "@/functions/crypto/utils"

export async function exchangePublicTokenForAccessTokenServerAction(
  userId: string,
  publicToken: string
) {
  const accessToken = await exchangePublicTokenForAccessToken(publicToken)

  // Add the Item to the database
  const { item, accounts } = await getAccounts(accessToken)

  const encryptionKey = process.env.KEY_IN_USE!
  const keyVersion = process.env.KEY_VERSION!

  const { cipherText: encryptedAccessToken, keyVersion: encryptionKeyVersion } =
    encryptAccessToken(accessToken, encryptionKey, keyVersion)

  await createItem({
    id: item.item_id,
    userId,
    accessToken: encryptedAccessToken,
    encryptionKeyVersion,
    institutionName: item.institution_name || ""
  })

  // Add each account associated with the Item to the database
  for (const account of accounts) {
    await createAccount({
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

  const account = await getAccount(accountId)
  if (!account) return

  const associatedItem = await getItem(account.itemId)
  if (!associatedItem) return

  if (associatedItem.userId !== userId) return

  await deleteAccount(accountId)
  revalidatePath("/settings")
}

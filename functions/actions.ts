"use server"

// Functions
import {
  exchangePublicTokenForAccessToken,
  getAccountsFromPlaid,
  removeItemFromPlaid
} from "@/functions/plaid"
import {
  checkForRedundantItem,
  createItemInDb,
  getItemFromDb
} from "@/functions/db/items"
import {
  createAccountInDb,
  deleteAccountFromDb,
  getAccountFromDb,
  matchAccountFromDb
} from "@/functions/db/accounts"
import { revalidatePath } from "next/cache"
import { encryptAccessToken } from "@/functions/crypto/utils"

export async function exchangePublicTokenForAccessTokenServerAction(
  userId: string,
  publicToken: string
) {
  const accessToken = await exchangePublicTokenForAccessToken(publicToken)

  const { item, accounts } = await getAccountsFromPlaid({ accessToken })

  const encryptionKey = process.env.KEY_IN_USE!
  const keyVersion = process.env.KEY_VERSION!
  const { cipherText: encryptedAccessToken, keyVersion: encryptionKeyVersion } =
    encryptAccessToken(accessToken, encryptionKey, keyVersion)

  const createItemInput = {
    id: item.item_id,
    userId,
    accessToken: encryptedAccessToken,
    encryptionKeyVersion,
    institutionId: item.institution_id || ""
  }

  const isRedundantItem = await checkForRedundantItem(createItemInput)
  if (isRedundantItem) return await removeItemFromPlaid({ accessToken })
  await createItemInDb(createItemInput)

  for (const account of accounts) {
    const accountExists = await matchAccountFromDb({
      name: account.name,
      mask: account.mask
    })
    if (accountExists) continue
    await createAccountInDb({
      id: account.account_id,
      itemId: item.item_id,
      name: account.name,
      mask: account.mask || undefined
    })
  }

  revalidatePath("/settings")
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

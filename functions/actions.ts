"use server"

// Functions
import {
  describePlaidError,
  exchangePublicTokenForAccessToken,
  fireTestWebhook,
  getAccountsFromPlaid,
  getPlaidError,
  removeItemFromPlaid,
  requiresReauthentication,
  resetSandboxItemLogin
} from "@/functions/plaid"
import {
  checkForRedundantItem,
  createItemInDb,
  getItemFromDb,
  getItemsFromDb,
  setItemPlaidErrorCodeInDb
} from "@/functions/db/items"
import {
  createAccountInDb,
  deleteAccountFromDb,
  getAccountFromDb,
  matchAccountFromDb
} from "@/functions/db/accounts"
import {
  decryptAccessToken,
  encryptAccessToken
} from "@/functions/crypto/utils"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { syncItem } from "@/functions/items"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getTransactionFromDb } from "@/functions/db/transactions"
import { upsertTransactionOverrideSetInDb } from "@/functions/db/transactionOverrideSets"

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

export async function syncTransactionsServerAction(userId: string) {
  after(async () => {
    const userItems = await getItemsFromDb({ userId })
    let anyItemErrored = false
    for (const item of userItems) {
      const plaidErrorCode = await syncItem(item)
      if (plaidErrorCode) anyItemErrored = true
    }
    revalidatePath("/inbox")
    // Surface (or clear) the reconnection prompt for any Item whose state changed
    if (anyItemErrored || userItems.some((item) => item.plaidErrorCode)) {
      revalidatePath("/settings")
    }
  })
}

/**
 * Finishes an update mode Link flow. The Item's access token is unchanged, so all that's left is to clear the recorded error and pick up the transactions missed while the Item was down.
 *
 * @param itemId the ID of the repaired Item
 */
export async function completeItemUpdateServerAction(itemId: string) {
  const user = await getOrCreateCurrentUser()

  const item = await getItemFromDb({ itemId })
  if (!item) return
  if (item.userId !== user.id) return

  await setItemPlaidErrorCodeInDb({ itemId, plaidErrorCode: null })
  revalidatePath("/settings")

  after(async () => {
    await syncItem({ ...item, plaidErrorCode: null })
    revalidatePath("/inbox")
  })
}

export async function renameTransactionServerAction(
  transactionId: string,
  name: string
) {
  const user = await getOrCreateCurrentUser()

  const transaction = await getTransactionFromDb({ transactionId })
  if (!transaction) return

  const account = await getAccountFromDb({ accountId: transaction.accountId })
  if (!account) return

  const item = await getItemFromDb({ itemId: account.itemId })
  if (!item) return

  if (item.userId !== user.id) return

  const trimmed = name.trim()
  await upsertTransactionOverrideSetInDb({
    transactionId,
    name: trimmed === "" ? null : trimmed
  })

  revalidatePath("/inbox")
}

export async function fireTestWebhookServerAction(formData: FormData) {
  const rawFormData = { userId: formData.get("userId")?.toString() }
  const { userId } = rawFormData
  if (!userId) return

  const userItems = await getItemsFromDb({ userId })
  const firstAccessTokenEncrypted = userItems[0].accessToken
  const encryptionKey = process.env.KEY_IN_USE!
  const keyVersion = process.env.KEY_VERSION!
  const firstAccessToken = decryptAccessToken(
    firstAccessTokenEncrypted,
    encryptionKey,
    keyVersion
  ).plainText

  await fireTestWebhook({ accessToken: firstAccessToken })
}

/**
 * Expires the login on every Item a user has, so the update mode flow can be exercised on demand.
 * Sandbox only.
 */
export async function resetItemLoginServerAction(formData: FormData) {
  const rawFormData = { userId: formData.get("userId")?.toString() }
  const { userId } = rawFormData
  if (!userId) return

  const userItems = await getItemsFromDb({ userId })
  const encryptionKey = process.env.KEY_IN_USE!
  for (const item of userItems) {
    const { plainText: accessToken } = decryptAccessToken(
      item.accessToken,
      encryptionKey,
      item.encryptionKeyVersion
    )
    let plaidErrorCode = "ITEM_LOGIN_REQUIRED"
    try {
      await resetSandboxItemLogin({ accessToken })
    } catch (error) {
      const plaidError = getPlaidError(error)
      if (!plaidError) throw error

      // Plaid refuses to expire an Item that has already gone bad — which is the state this button exists to produce, so take it as the answer rather than a failure
      if (!requiresReauthentication(plaidError.error_code)) {
        console.error(
          `[Plaid] Could not expire login for Item ${item.id} — ${describePlaidError(plaidError)}`
        )
        continue
      }
      plaidErrorCode = plaidError.error_code
    }

    await setItemPlaidErrorCodeInDb({ itemId: item.id, plaidErrorCode })
  }

  revalidatePath("/settings")
}

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
  matchUserAccountFromDb
} from "@/functions/db/accounts"
import {
  decryptItemAccessToken,
  encryptAccessToken
} from "@/functions/crypto/utils"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { syncItem } from "@/functions/items"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { isDevelopment } from "@/lib/utils"
import {
  getTransactionFromDb,
  markTransactionsReviewedInDb,
  markTransactionsUnreviewedInDb,
  resetReviewStatusInDb
} from "@/functions/db/transactions"
import { upsertTransactionOverrideSetInDb } from "@/functions/db/transactionOverrideSets"

export async function exchangePublicTokenForAccessTokenServerAction(
  publicToken: string
) {
  const { id: userId } = await getOrCreateCurrentUser()

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

  const isRedundantItem = await checkForRedundantItem({
    userId,
    institutionId: createItemInput.institutionId,
    accounts
  })
  if (isRedundantItem) return await removeItemFromPlaid({ accessToken })
  await createItemInDb(createItemInput)

  for (const account of accounts) {
    const accountExists = await matchUserAccountFromDb({
      userId,
      institutionId: createItemInput.institutionId,
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
  const user = await getOrCreateCurrentUser()

  const accountId = formData.get("accountId")?.toString()
  if (!accountId) return

  const account = await getAccountFromDb({ accountId })
  if (!account) return

  const associatedItem = await getItemFromDb({ itemId: account.itemId })
  if (!associatedItem) return

  if (associatedItem.userId !== user.id) return

  await deleteAccountFromDb({ accountId })
  revalidatePath("/settings")
}

export async function syncTransactionsServerAction() {
  const user = await getOrCreateCurrentUser()

  after(async () => {
    const userItems = await getItemsFromDb({ userId: user.id })
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

export async function markTransactionsReviewedServerAction(
  transactionIds: string[]
) {
  const user = await getOrCreateCurrentUser()

  await markTransactionsReviewedInDb({ userId: user.id, transactionIds })
  revalidatePath("/inbox")
}

export async function markTransactionsUnreviewedServerAction(
  transactionIds: string[]
) {
  const user = await getOrCreateCurrentUser()

  await markTransactionsUnreviewedInDb({ userId: user.id, transactionIds })
  revalidatePath("/inbox")
}

/**
 * Marks all of a user's transactions as unreviewed, returning them to the Inbox.
 * Development only.
 */
export async function resetReviewStatusServerAction() {
  if (!isDevelopment()) return

  const user = await getOrCreateCurrentUser()

  await resetReviewStatusInDb({ userId: user.id })
  revalidatePath("/inbox")
}

/**
 * Fires a test `SYNC_UPDATES_AVAILABLE` webhook for the first of a user's Items that will take one.
 * Development only, against Sandbox.
 */
export async function fireTestWebhookServerAction() {
  if (!isDevelopment()) return

  const user = await getOrCreateCurrentUser()

  const userItems = await getItemsFromDb({ userId: user.id })
  for (const item of userItems) {
    // Every Item is tried, even one recorded as broken — Plaid's answer is current, whereas the recorded error may be stale
    try {
      await fireTestWebhook({ accessToken: decryptItemAccessToken(item) })
      return
    } catch (error) {
      const plaidError = getPlaidError(error)
      if (!plaidError) throw error

      console.error(
        `[Plaid] Could not fire test webhook for Item ${item.id} — ${describePlaidError(plaidError)}`
      )

      // The Item has gone bad since it was last synced, so record that to surface the reconnection prompt, and try the next one
      if (requiresReauthentication(plaidError.error_code)) {
        await setItemPlaidErrorCodeInDb({
          itemId: item.id,
          plaidErrorCode: plaidError.error_code
        })
        revalidatePath("/settings")
      }
    }
  }

  console.log("[Plaid] No healthy Items to fire a test webhook for")
}

/**
 * Expires the login on every Item a user has, so the update mode flow can be exercised on demand.
 * Development only, against Sandbox.
 */
export async function resetItemLoginServerAction() {
  if (!isDevelopment()) return

  const user = await getOrCreateCurrentUser()

  const userItems = await getItemsFromDb({ userId: user.id })
  for (const item of userItems) {
    const accessToken = decryptItemAccessToken(item)
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

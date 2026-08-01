import {
  createUpdateModeLinkToken,
  getPlaidErrorCode,
  syncTransactions,
  warnsOfPendingDisconnection
} from "@/functions/plaid"
import { setItemPlaidErrorCodeInDb } from "@/functions/db/items"
import { decryptAccessToken } from "@/functions/crypto/utils"

// Types
import type { Item } from "@/generated/prisma/client"

/*
 * Item-level operations spanning both Plaid and the database.
 * These live outside `functions/plaid.ts` to keep it free of a circular dependency on `functions/db/items.ts`.
 */

function getAccessToken(item: Item) {
  const encryptionKey = process.env.KEY_IN_USE!
  const { plainText } = decryptAccessToken(
    item.accessToken,
    encryptionKey,
    item.encryptionKeyVersion
  )
  return plainText
}

/**
 * Syncs an Item's transactions, recording any Plaid error on the Item instead of throwing.
 *
 * Items go bad for reasons outside our control — changed credentials, revoked consent, or, in Sandbox, simply turning 30 days old — and one bad Item shouldn't take down a sync across the rest of a user's Items.
 * Recorded errors are surfaced in settings, where the user can repair the Item via Link's update mode.
 *
 * @param item the Item to sync, as stored in the database
 * @returns the Plaid `error_code` that stopped the sync, or `null` if the sync succeeded
 */
export async function syncItem(item: Item) {
  try {
    await syncTransactions(getAccessToken(item))
  } catch (error) {
    const plaidErrorCode = getPlaidErrorCode(error)
    if (!plaidErrorCode) throw error

    console.error(`[Plaid] Item ${item.id} sync failed: ${plaidErrorCode}`)
    await setItemPlaidErrorCodeInDb({ itemId: item.id, plaidErrorCode })
    return plaidErrorCode
  }

  // A successful sync proves the Item works, so any failure recorded against it is stale — including transient ones like `INSTITUTION_DOWN`, which nothing else clears.
  // The pending warnings are the exception: an Item keeps syncing right up until its consent lapses, so success doesn't disprove them. Those are cleared by the `LOGIN_REPAIRED` webhook or by finishing update mode, both of which mean the user actually re-authenticated.
  if (
    item.plaidErrorCode &&
    !warnsOfPendingDisconnection(item.plaidErrorCode)
  ) {
    await setItemPlaidErrorCodeInDb({ itemId: item.id, plaidErrorCode: null })
  }
  return null
}

/**
 * Creates a Link token for repairing an Item through update mode.
 *
 * @param item the Item to repair, as stored in the database
 * @returns the Link token to hand to Link
 */
export async function getUpdateModeLinkTokenForItem(item: Item) {
  const response = await createUpdateModeLinkToken({
    userId: item.userId,
    accessToken: getAccessToken(item)
  })
  return response.link_token
}

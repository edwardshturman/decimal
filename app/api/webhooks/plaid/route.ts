import { getItemFromDb } from "@/functions/db/items"
import { syncTransactions } from "@/functions/plaid"
import { decryptAccessToken } from "@/functions/crypto/utils"

export async function POST(request: Request) {
  const body = await request.json()
  const { webhook_type, webhook_code, item_id } = body

  if (
    webhook_type === "TRANSACTIONS" &&
    webhook_code === "SYNC_UPDATES_AVAILABLE"
  ) {
    const item = await getItemFromDb({ itemId: item_id })
    if (!item) {
      return Response.json({ error: "Item not found" }, { status: 404 })
    }

    const encryptionKey = process.env.KEY_IN_USE!
    const keyVersion = item.encryptionKeyVersion
    const { plainText: accessToken } = decryptAccessToken(
      item.accessToken,
      encryptionKey,
      keyVersion
    )

    await syncTransactions(accessToken)
  }

  return Response.json({ ok: true })
}

import { syncItem } from "@/functions/items"
import { getItemFromDb, setItemPlaidErrorCodeInDb } from "@/functions/db/items"

export async function POST(request: Request) {
  const body = await request.json()
  const { webhook_type, webhook_code, item_id, error } = body

  // Not every webhook is about an Item, e.g. those for a Link session
  if (!item_id) return Response.json({ ok: true })

  const item = await getItemFromDb({ itemId: item_id })
  if (!item) {
    return Response.json({ error: "Item not found" }, { status: 404 })
  }

  if (
    webhook_type === "TRANSACTIONS" &&
    webhook_code === "SYNC_UPDATES_AVAILABLE"
  ) {
    await syncItem(item)
  }

  // Plaid reports the health of an Item out of band, ahead of any call we make failing
  // https://plaid.com/docs/api/items/#item-webhooks
  if (webhook_type === "ITEM") {
    switch (webhook_code) {
      case "ERROR":
        await setItemPlaidErrorCodeInDb({
          itemId: item.id,
          plaidErrorCode: error?.error_code ?? "ITEM_LOGIN_REQUIRED"
        })
        break
      case "PENDING_DISCONNECT":
      case "PENDING_EXPIRATION":
        await setItemPlaidErrorCodeInDb({
          itemId: item.id,
          plaidErrorCode: webhook_code
        })
        break
      case "LOGIN_REPAIRED":
        await setItemPlaidErrorCodeInDb({
          itemId: item.id,
          plaidErrorCode: null
        })
        break
    }
  }

  return Response.json({ ok: true })
}

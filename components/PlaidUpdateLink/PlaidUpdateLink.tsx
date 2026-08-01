"use client"

// Components
import { Button } from "@/components/Button"

// Plaid
import { type PlaidLinkOptions, usePlaidLink } from "react-plaid-link"

// Server Actions
import { completeItemUpdateServerAction } from "@/functions/actions"

/**
 * Launches Link in update mode to repair an Item whose connection has gone bad.
 * Unlike the initial Link flow, there is no public token to exchange — the Item keeps the access token it already has.
 */
export function PlaidUpdateLink({
  itemId,
  linkToken
}: {
  itemId: string
  linkToken: string
}) {
  async function onSuccess() {
    await completeItemUpdateServerAction(itemId)
  }

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess
  }

  const { open, ready } = usePlaidLink(config)

  return (
    <Button onClick={() => open()} disabled={!ready}>
      Reconnect
    </Button>
  )
}

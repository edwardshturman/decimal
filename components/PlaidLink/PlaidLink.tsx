"use client"

// Components
import { Button } from "@/components/Button"

// Plaid
import { type PlaidLinkOptions, usePlaidLink } from "react-plaid-link"

// Server Actions
import {
  exchangePublicTokenForAccessTokenServerAction,
  syncTransactionsServerAction
} from "@/functions/actions"

export function PlaidLink({
  userId,
  linkToken
}: {
  userId: string
  linkToken: string
}) {
  async function onSuccess(public_token: string) {
    await exchangePublicTokenForAccessTokenServerAction(userId, public_token)
    await syncTransactionsServerAction(userId)
  }

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess
  }

  const { open, ready } = usePlaidLink(config)

  return (
    <Button onClick={() => open()} disabled={!ready}>
      Connect a bank account
    </Button>
  )
}

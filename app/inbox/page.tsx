// Functions
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getAccountsAndTransactionsFromDb } from "@/functions/db/transactions"

// Components
import { Inbox } from "@/components/Inbox"
import { PlaidLink } from "@/components/PlaidLink"

export default async function Plaid() {
  const user = await getOrCreateCurrentUser()
  const { accounts, transactions } = await getAccountsAndTransactionsFromDb({
    userId: user.id
  })

  async function PlaidLinkWrapper() {
    if (accounts.length !== 0) return <></>
    const linkTokenResponse = await createLinkToken(user.id)
    return (
      <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
    )
  }

  return (
    <>
      <main>
        <PlaidLinkWrapper />
        <Inbox transactions={transactions} />
      </main>
    </>
  )
}

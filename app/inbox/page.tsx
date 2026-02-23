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

  let plaidLink = null
  if (accounts.length === 0) {
    const linkTokenResponse = await createLinkToken(user.id)
    plaidLink = (
      <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
    )
  }

  return (
    <>
      <main>
        {plaidLink}
        {transactions.length !== 0 && <Inbox transactions={transactions} />}
      </main>
    </>
  )
}

// Functions
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getAccountsAndTransactionsFromDb } from "@/functions/db/transactions"

// Components
import { Inbox } from "@/components/Inbox"
import { PlaidLink } from "@/components/PlaidLink"
import { fireTestWebhookServerAction } from "@/functions/actions"

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
        <Inbox transactions={transactions} />
        <form action={fireTestWebhookServerAction}>
          <input hidden readOnly name="userId" value={user.id ?? ""} />
          <input type="submit" value="Fire test webbook" />
        </form>
      </main>
    </>
  )
}

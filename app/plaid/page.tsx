// Functions
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getTransactionsAndAccounts } from "@/functions/db/transactions"

// Components
import { SignOut } from "@/components/SignOut"
import { PlaidLink } from "@/components/PlaidLink"
import { Transactions } from "@/components/Transactions"

export default async function Plaid() {
  const user = await getOrCreateCurrentUser()
  const linkTokenResponse = await createLinkToken(user.id)
  const { accounts, transactions } = await getTransactionsAndAccounts(user.id)

  // TODO: After the user connects their accounts, add a new option for "add a new account"
  return (
    <>
      <p>
        User: {user.name}, Email: {user.email}
      </p>
      <p>Link token: {linkTokenResponse.link_token}</p>
      {accounts.length === 0 ? (
        <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
      ) : (
        <Transactions initialTransactions={transactions} accounts={accounts} />
      )}
      <SignOut />
    </>
  )
}

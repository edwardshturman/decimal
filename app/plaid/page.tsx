// Functions
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getTransactionsAndAccounts } from "@/functions/db/transactions"

// Components
import { Inbox } from "@/components/Inbox"
import { SignOut } from "@/components/SignOut"
import { PlaidLink } from "@/components/PlaidLink"

// Constants
import { APP_NAME } from "@/lib/constants"

// Styles
import styles from "./Plaid.module.css"

export default async function Plaid() {
  const user = await getOrCreateCurrentUser()
  const { accounts, transactions } = await getTransactionsAndAccounts(user.id)

  async function PlaidLinkWrapper() {
    if (accounts.length !== 0) return <></>
    const linkTokenResponse = await createLinkToken(user.id)
    return (
      <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
    )
  }

  // TODO: After the user connects their accounts, add a new option for "add a new account"
  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{APP_NAME}</h1>
          <SignOut />
        </header>
        <PlaidLinkWrapper />
        <Inbox transactions={transactions.toReversed().slice(0, 10)} />
      </main>
    </>
  )
}

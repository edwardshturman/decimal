// Functions
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"

// Components
import { PlaidLink } from "@/components/PlaidLink"

// Styles
import styles from "@/app/Page.module.css"

export default async function Settings() {
  const user = await getOrCreateCurrentUser()
  const linkTokenResponse = await createLinkToken(user.id)

  return (
    <>
      <h2>Settings</h2>
      <h3>Accounts</h3>
      <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
    </>
  )
}

// Functions
import { getItems } from "@/functions/db/items"
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getAccountsByItemId } from "@/functions/db/accounts"

// Components
import { PlaidLink } from "@/components/PlaidLink"

// Styles
import styles from "./Settings.module.css"

// Types
import type { Account } from "@/generated/prisma"

export default async function Settings() {
  const user = await getOrCreateCurrentUser()
  const userItems = await getItems(user.id)
  const userAccounts: Account[] = []
  for (const item of userItems) {
    const itemAccounts = await getAccountsByItemId(item.id)
    userAccounts.push(...itemAccounts)
  }
  const linkTokenResponse = await createLinkToken(user.id)

  return (
    <>
      <h2 className={styles.heading}>Settings</h2>
      <div className={styles.paneContainer}>
        <h3>Accounts</h3>
        <p>View your accounts, or connect a new one</p>
        <ul className={styles.accountsList}>
          {userAccounts.map((account) => {
            return (
              <li key={account.id}>
                <span className={styles.accountName}>{account.name}</span>
                <span className={styles.connectedOn}>
                  Connected on{" "}
                  {Intl.DateTimeFormat("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year:
                      account.createdAt.getFullYear() !==
                      new Date().getFullYear()
                        ? "numeric"
                        : undefined
                  }).format(account.createdAt)}
                </span>
              </li>
            )
          })}
        </ul>
        <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
      </div>
    </>
  )
}

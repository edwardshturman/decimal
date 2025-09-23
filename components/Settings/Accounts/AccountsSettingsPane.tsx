// Functions
import { getUserItems } from "@/functions/db/items"
import { createLinkToken } from "@/functions/plaid"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getAccountsByItemId } from "@/functions/db/accounts"
import { deleteAccountServerAction } from "@/functions/actions"

// Components
import { Suspense } from "react"
import { PlaidLink } from "@/components/PlaidLink"
import { SettingsPane } from "@/components/Settings/Pane"

// Types
import type { Account } from "@/generated/prisma"

// Styles
import styles from "./AccountsSettingsPane.module.css"

function AccountsListSkeleton() {
  return (
    <ul className={styles.list}>
      <li>
        <span>Loading...</span>
      </li>
    </ul>
  )
}

async function AccountsList({ userId }: { userId: string }) {
  const userItems = await getUserItems(userId)
  const userAccounts: Account[] = []
  for (const item of userItems) {
    const itemAccounts = await getAccountsByItemId(item.id)
    userAccounts.push(...itemAccounts)
  }

  return (
    <ul className={styles.list}>
      {userAccounts.map((account) => {
        return (
          <li key={account.id}>
            <span>{account.id.slice(1, 6)}</span>
            <span className={styles.name}>{account.name}</span>
            <span className={styles.remove}>
              <form action={deleteAccountServerAction}>
                <input hidden readOnly name="userId" value={userId ?? ""} />
                <input
                  hidden
                  readOnly
                  name="accountId"
                  value={account.id ?? ""}
                />
                <input type="submit" value="Remove" />
              </form>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export async function AccountsSettingsPane() {
  const user = await getOrCreateCurrentUser()
  const linkTokenResponse = await createLinkToken(user.id)

  return (
    <SettingsPane
      title="Accounts"
      description="View your accounts, or connect a new one"
    >
      <Suspense fallback={<AccountsListSkeleton />}>
        <AccountsList userId={user.id} />
      </Suspense>
      <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
    </SettingsPane>
  )
}

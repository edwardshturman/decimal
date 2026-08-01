// Functions
import { getItemsFromDb } from "@/functions/db/items"
import { getOrCreateCurrentUser } from "@/lib/auth"
import { getAccountsFromDb } from "@/functions/db/accounts"
import { deleteAccountServerAction } from "@/functions/actions"
import { getUpdateModeLinkTokenForItem } from "@/functions/items"
import { createLinkToken, requiresReauthentication } from "@/functions/plaid"

// Components
import { Suspense } from "react"
import { PlaidLink } from "@/components/PlaidLink"
import { SettingsPane } from "@/components/Settings/Pane"
import { PlaidUpdateLink } from "@/components/PlaidUpdateLink"

// Types
import type { Account } from "@/generated/prisma/client"

// Styles
import styles from "./AccountsSettingsPane.module.css"

// Renders a list of account names as prose, e.g. "Checking, Saving, and Credit"
const accountNameList = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction"
})

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
  const userItems = await getItemsFromDb({ userId })
  const userAccounts: Account[] = []
  for (const item of userItems) {
    const itemAccounts = await getAccountsFromDb({ itemId: item.id })
    userAccounts.push(...itemAccounts)
  }

  return (
    <ul className={styles.list}>
      {userAccounts.map((account) => {
        return (
          <li key={account.id}>
            <span className={styles.id}>{account.id.slice(1, 6)}</span>
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
                <input type="submit" value="× Remove" />
              </form>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Prompts the user to re-authenticate any Item whose connection has gone bad, e.g. one that Plaid has put into `ITEM_LOGIN_REQUIRED`.
 * Until an Item is repaired, it stops returning transactions entirely.
 */
async function ReconnectPrompts({ userId }: { userId: string }) {
  const userItems = await getItemsFromDb({ userId })
  const itemsToRepair = userItems.filter((item) =>
    requiresReauthentication(item.plaidErrorCode)
  )
  if (itemsToRepair.length === 0) return null

  const prompts = await Promise.all(
    itemsToRepair.map(async (item) => {
      const accounts = await getAccountsFromDb({ itemId: item.id })
      const linkToken = await getUpdateModeLinkTokenForItem(item)
      return { item, accounts, linkToken }
    })
  )

  return (
    <ul className={styles.reconnect}>
      {prompts.map(({ item, accounts, linkToken }) => {
        // The fallback covers an unknown number of accounts, so it takes the plural verb alongside the many-account case
        const names = accounts.map((account) => account.name)
        const isPlural = names.length !== 1

        return (
          <li key={item.id}>
            <p>
              {accountNameList.format(names) || "One or more of your accounts"}{" "}
              stopped syncing, and {isPlural ? "need" : "needs"} you to sign in
              again.
            </p>
            <PlaidUpdateLink itemId={item.id} linkToken={linkToken} />
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
      <Suspense>
        <ReconnectPrompts userId={user.id} />
      </Suspense>
      <PlaidLink linkToken={linkTokenResponse.link_token} userId={user.id} />
    </SettingsPane>
  )
}

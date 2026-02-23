// Functions
import { getOrCreateCurrentUser } from "@/lib/auth"
import { fireTestWebhookServerAction } from "@/functions/actions"

// Components
import { Settings } from "@/components/Settings"

// Styles
import styles from "./Settings.module.css"

export default async function SettingsPage() {
  const user = await getOrCreateCurrentUser()

  return (
    <>
      <h2 className={styles.heading}>Settings</h2>
      <Settings.Accounts />
      <form action={fireTestWebhookServerAction}>
        <input hidden readOnly name="userId" value={user.id ?? ""} />
        <input type="submit" value="Fire test webhook" />
      </form>
    </>
  )
}

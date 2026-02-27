// Functions
import { getOrCreateCurrentUser } from "@/lib/auth"
import { fireTestWebhookServerAction } from "@/functions/actions"

// Components
import { Button } from "@/components/Button"
import { SettingsPane } from "@/components/Settings/Pane"

// Styles
import styles from "./DevActionsSettingsPane.module.css"

export async function DevActionsSettingsPane() {
  const user = await getOrCreateCurrentUser()

  return (
    <SettingsPane
      title="Dev Actions"
      description="Developer tools for testing and debugging"
    >
      <form
        className={styles["test-webhook"]}
        action={fireTestWebhookServerAction}
      >
        <input hidden readOnly name="userId" value={user.id ?? ""} />
        <Button type="submit">Fire test webhook</Button>
      </form>
    </SettingsPane>
  )
}

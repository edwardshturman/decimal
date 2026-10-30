// Functions
import {
  fireTestWebhookServerAction,
  resetItemLoginServerAction,
  resetReviewStatusServerAction
} from "@/functions/actions"

// Components
import { Button } from "@/components/Button"
import { SettingsPane } from "@/components/Settings/Pane"

// Styles
import styles from "./DevActionsSettingsPane.module.css"

export function DevActionsSettingsPane() {
  return (
    <SettingsPane
      title="Dev Actions"
      description="Developer tools for testing and debugging"
    >
      <form
        className={styles["test-webhook"]}
        action={fireTestWebhookServerAction}
      >
        <Button type="submit">Fire test webhook</Button>
      </form>
      <form
        className={styles["reset-login"]}
        action={resetItemLoginServerAction}
      >
        <Button type="submit">Expire bank logins</Button>
      </form>
      <form
        className={styles["reset-reviews"]}
        action={resetReviewStatusServerAction}
      >
        <Button type="submit">Reset review status</Button>
      </form>
    </SettingsPane>
  )
}

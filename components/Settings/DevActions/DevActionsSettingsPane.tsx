// Functions
import { getOrCreateCurrentUser } from "@/lib/auth"
import { fireTestWebhookServerAction } from "@/functions/actions"

// Components
import { Button } from "@/components/Button"
import { SettingsPane } from "@/components/Settings/Pane"

export async function DevActionsSettingsPane() {
  const user = await getOrCreateCurrentUser()

  return (
    <SettingsPane
      title="Dev Actions"
      description="Developer tools for testing and debugging"
    >
      <form action={fireTestWebhookServerAction}>
        <input hidden readOnly name="userId" value={user.id ?? ""} />
        <Button type="submit">Fire test webhook</Button>
      </form>
    </SettingsPane>
  )
}

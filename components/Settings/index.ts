import { AccountsSettingsPane } from "./Accounts"
import { DevActionsSettingsPane } from "./DevActions"

type SettingsNamespace = {
  Accounts: typeof AccountsSettingsPane
  DevActions: typeof DevActionsSettingsPane
}

export const Settings = {} as SettingsNamespace
Settings.Accounts = AccountsSettingsPane
Settings.DevActions = DevActionsSettingsPane

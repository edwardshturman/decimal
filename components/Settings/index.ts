import { AccountsSettingsPane } from "./Accounts"

type SettingsNamespace = {
  Accounts: typeof AccountsSettingsPane
}

export const Settings = {} as SettingsNamespace
Settings.Accounts = AccountsSettingsPane

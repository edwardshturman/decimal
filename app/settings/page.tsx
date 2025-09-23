// Components
import { Settings } from "@/components/Settings"

// Styles
import styles from "./Settings.module.css"

export default function SettingsPage() {
  return (
    <>
      <h2 className={styles.heading}>Settings</h2>
      <Settings.Accounts />
    </>
  )
}

// Styles
import styles from "./SettingsPane.module.css"

export async function SettingsPane({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.paneContainer}>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  )
}

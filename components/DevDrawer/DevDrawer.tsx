"use client"

// Components
import { Drawer } from "vaul"
import { Button } from "@/components/Button"

// Hooks
import { useFormStatus } from "react-dom"
import { useEffect, useState } from "react"

// Server Actions
import {
  fireTestWebhookServerAction,
  resetItemLoginServerAction,
  resetReviewStatusServerAction
} from "@/functions/actions"

// Styles
import styles from "./DevDrawer.module.css"

const DEV_ACTIONS = [
  {
    name: "Fire test webhook",
    description:
      "Has Plaid send a new-transactions webhook for your first bank, triggering a sync",
    detail: "POST /sandbox/item/fire_webhook",
    action: fireTestWebhookServerAction
  },
  {
    name: "Expire bank logins",
    description: "Forces every connected bank to require signing in again",
    detail: "POST /sandbox/item/reset_login",
    action: resetItemLoginServerAction
  },
  {
    name: "Reset review status",
    description: "Sends every transaction back to the Inbox",
    detail: "UPDATE transactions SET reviewedAt = NULL",
    action: resetReviewStatusServerAction
  }
]

function RunButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Running…" : "Run"}
    </Button>
  )
}

function TabLabel({ open }: { open: boolean }) {
  return (
    <>
      Dev Actions
      <kbd className={styles.shortcut}>$</kbd>
      <svg
        className={styles.chevron}
        data-open={open}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M11.4697 9.46967C11.7626 9.17678 12.2374 9.17678 12.5303 9.46967L16.5303 13.4697C16.8232 13.7626 16.8232 14.2374 16.5303 14.5303C16.2374 14.8232 15.7626 14.8232 15.4697 14.5303L12 11.0607L8.53033 14.5303C8.23744 14.8232 7.76256 14.8232 7.46967 14.5303C7.17678 14.2374 7.17678 13.7626 7.46967 13.4697L11.4697 9.46967Z"
        />
      </svg>
    </>
  )
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

export function DevDrawer() {
  const [open, setOpen] = useState(false)

  // `$` toggles the drawer from anywhere, unless the user is typing
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "$") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      setOpen((currentOpen) => !currentOpen)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      {/* Sits exactly where the drawer's own tab starts out, so the drawer covers it as it slides up, and the tab looks like it rides along */}
      <Drawer.Trigger asChild>
        <button
          className={`${styles.tab} ${styles.dockedTab}`}
          aria-label="Open dev actions"
          aria-keyshortcuts="$"
        >
          <TabLabel open={false} />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content className={styles.content}>
          <div className={styles.sheet}>
            <Drawer.Close asChild>
              <button
                className={`${styles.tab} ${styles.attachedTab}`}
                aria-label="Close dev actions"
                aria-keyshortcuts="$"
              >
                <TabLabel open />
              </button>
            </Drawer.Close>
            <div className={styles.inner}>
              <div className={styles.header}>
                <Drawer.Title className={styles.title}>
                  Dev Actions
                </Drawer.Title>
                <span className={styles.env}>NODE_ENV = development</span>
              </div>
              <Drawer.Description className={styles.description}>
                Tools for testing &amp; debugging
              </Drawer.Description>
              <ul className={styles.actions}>
                {DEV_ACTIONS.map(({ name, description, detail, action }) => (
                  <li key={name}>
                    <form className={styles.action} action={action}>
                      <div className={styles.actionText}>
                        <div className={styles.actionHeading}>
                          <span className={styles.actionName}>{name}</span>
                          <code className={styles.actionDetail}>{detail}</code>
                        </div>
                        <p className={styles.actionDescription}>
                          {description}
                        </p>
                      </div>
                      <RunButton />
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

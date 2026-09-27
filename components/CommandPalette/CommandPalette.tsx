// Components
import { Command } from "cmdk"
import * as Dialog from "@radix-ui/react-dialog"

// Hooks
import { useEffect, useRef, useState } from "react"

// Functions
import { actionsForCount } from "@/lib/actions"

// Types
import type { Action } from "@/lib/actions"
import type { Transaction } from "@/generated/prisma/client"

// Styles
import styles from "./CommandPalette.module.css"

type Mode = "menu" | "rename"

export function CommandPalette({
  open,
  onOpenChange,
  transactions,
  onRename,
  initialMode = "menu"
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactions: Transaction[]
  onRename: (newName: string) => void
  initialMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [wasOpen, setWasOpen] = useState(open)
  const [name, setName] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Derived values
  const target = transactions[0] ?? null
  const label =
    transactions.length === 1
      ? target?.name
      : `${transactions.length} transactions`
  const actions = actionsForCount(transactions.length)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMode(initialMode)
      setName(target?.name ?? "")
    }
  }

  useEffect(() => {
    if (mode !== "rename") return
    const input = renameInputRef.current
    input?.focus()
    input?.select()
  }, [mode])

  function runAction(action: Action) {
    if (action.id === "rename") {
      setMode("rename")
      return
    }
    // Group actions are placeholders until there is something to run
    onOpenChange(false)
  }

  function submitRename() {
    onRename(name.trim())
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          onEscapeKeyDown={(event) => {
            if (mode === "rename" && initialMode === "menu") {
              event.preventDefault()
              setMode("menu")
            }
          }}
        >
          <Dialog.Description className={styles.visuallyHidden}>
            {transactions.length === 1
              ? "Choose an action for this transaction."
              : "Choose an action for the selected transactions."}
          </Dialog.Description>
          <Command className={styles.command} label="Transaction actions">
            <Dialog.Title className={styles.title}>
              {mode === "menu" ? (
                label
              ) : (
                <>
                  <span className={styles.titleContext}>{label}</span>
                  <span className={styles.titleSeparator}> › </span>
                  Rename
                </>
              )}
            </Dialog.Title>
            {mode === "menu" ? (
              <>
                <Command.Input
                  className={styles.input}
                  placeholder="Search actions…"
                  autoFocus
                />
                <Command.List className={styles.list}>
                  <Command.Empty className={styles.empty}>
                    No actions found.
                  </Command.Empty>
                  {actions.map((action) => (
                    <Command.Item
                      key={action.id}
                      className={styles.item}
                      onSelect={() => runAction(action)}
                    >
                      <span>{action.label}</span>
                      {action.shortcut && (
                        <kbd className={styles.shortcut}>{action.shortcut}</kbd>
                      )}
                    </Command.Item>
                  ))}
                </Command.List>
              </>
            ) : (
              <input
                ref={renameInputRef}
                className={styles.input}
                value={name}
                placeholder="New name"
                aria-label="New transaction name"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    submitRename()
                  }
                }}
              />
            )}
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Components
import { Command } from "cmdk"
import * as Dialog from "@radix-ui/react-dialog"

// Hooks
import { useEffect, useRef, useState } from "react"

// Types
import type { Transaction } from "@/generated/prisma/client"

// Styles
import styles from "./CommandPalette.module.css"

type Mode = "menu" | "rename"

export function CommandPalette({
  open,
  onOpenChange,
  transaction,
  onRename,
  initialMode = "menu"
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  onRename: (newName: string) => void
  initialMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [wasOpen, setWasOpen] = useState(open)
  const [name, setName] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMode(initialMode)
      setName(transaction?.name ?? "")
    }
  }

  useEffect(() => {
    if (mode !== "rename") return
    const input = renameInputRef.current
    input?.focus()
    input?.select()
  }, [mode])

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
            Choose an action for this transaction.
          </Dialog.Description>
          <Command className={styles.command} label="Transaction actions">
            <Dialog.Title className={styles.title}>
              {mode === "menu" ? (
                transaction?.name
              ) : (
                <>
                  <span className={styles.titleContext}>
                    {transaction?.name}
                  </span>
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
                  <Command.Item
                    className={styles.item}
                    onSelect={() => setMode("rename")}
                  >
                    <span>Rename</span>
                    <kbd className={styles.shortcut}>R</kbd>
                  </Command.Item>
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

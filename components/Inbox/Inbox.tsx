"use client"

// Components
import {
  RovingFocusGroup,
  RovingFocusGroupItem
} from "@radix-ui/react-roving-focus"

// Hooks
import { useState } from "react"

// Types
import type { KeyboardEvent, MouseEvent } from "react"
import type { ClientFriendlyTransaction } from "@/functions/db/transactions"

import styles from "./Inbox.module.css"

export function Inbox({
  transactions
}: {
  transactions: ClientFriendlyTransaction[]
}) {
  function handleSelect(transaction: ClientFriendlyTransaction) {
    console.log(`Selected ${transaction.name}`)
  }
  function handleSlash(transaction: ClientFriendlyTransaction) {
    console.log(`Toggled slash for ${transaction.name}`)
  }
  function handleClick(
    event: MouseEvent<HTMLLIElement>,
    transaction: ClientFriendlyTransaction
  ) {
    handleSelect(transaction)
  }
  function handleKeyDown(
    event: KeyboardEvent<HTMLLIElement>,
    transaction: ClientFriendlyTransaction
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleSelect(transaction)
    }
    if (event.key === "/") {
      event.preventDefault()
      handleSlash(transaction)
    }
  }

  const [activeId, setActiveId] = useState(transactions[0].id)

  return (
    <RovingFocusGroup orientation="vertical">
      <ol className={styles.list} role="listbox" aria-label="Transaction Inbox">
        {transactions.map((transaction, index) => (
          <RovingFocusGroupItem
            key={transaction.id}
            asChild
            focusable
            autoFocus={index === 0}
            onFocus={() => setActiveId(transaction.id)}
          >
            <li
              className={styles.item}
              onKeyDown={(e) => handleKeyDown(e, transaction)}
              onClick={(e) => handleClick(e, transaction)}
              role="option"
              aria-selected={activeId === transaction.id}
            >
              {transaction.name}
            </li>
          </RovingFocusGroupItem>
        ))}
      </ol>
    </RovingFocusGroup>
  )
}

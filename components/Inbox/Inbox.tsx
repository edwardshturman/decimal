"use client"

import {
  RovingFocusGroup,
  RovingFocusGroupItem
} from "@radix-ui/react-roving-focus"

import type { KeyboardEvent, MouseEvent } from "react"
import { ClientFriendlyTransaction } from "@/functions/db/transactions"

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

  function handleClick(
    event: MouseEvent<HTMLLIElement>,
    transaction: ClientFriendlyTransaction
  ) {
    handleSelect(transaction)
  }

  return (
    <RovingFocusGroup orientation="vertical">
      <ol className={styles.list}>
        {transactions.map((transaction, index) => (
          <RovingFocusGroupItem
            key={transaction.id}
            asChild
            focusable
            autoFocus={index === 0}
          >
            <li
              className={styles.item}
              onKeyDown={(e) => handleKeyDown(e, transaction)}
              onClick={(e) => handleClick(e, transaction)}
            >
              {transaction.name}
            </li>
          </RovingFocusGroupItem>
        ))}
      </ol>
    </RovingFocusGroup>
  )
}

"use client"

// Components
import {
  RovingFocusGroup,
  RovingFocusGroupItem
} from "@radix-ui/react-roving-focus"

// Hooks
import { useCallback, useLayoutEffect, useRef, useState } from "react"

// Types
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react"
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
  const olRef = useRef<HTMLOListElement>(null)
  const liRefs = useRef<Record<string, HTMLElement>>({})
  const [highlightStyles, setHighlightStyles] = useState<CSSProperties>({
    transform: "translateY(0px)",
    height: "38px" // rough estimation of single-line item height
  })

  const updateHighlight = useCallback((id: string) => {
    const ol = olRef.current
    const li = liRefs.current[id]
    if (!ol || !li) return

    const olRect = ol.getBoundingClientRect()
    const liRect = li.getBoundingClientRect()

    setHighlightStyles({
      transform: `translateY(${liRect.top - olRect.top}px)`,
      height: `${liRect.height}px`
    })
  }, [])

  useLayoutEffect(() => {
    updateHighlight(activeId)
  }, [activeId, updateHighlight])

  return (
    <RovingFocusGroup orientation="vertical">
      <ol
        className={styles.list}
        role="listbox"
        aria-label="Transaction Inbox"
        ref={olRef}
      >
        <div className={styles.highlight} style={highlightStyles} />
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
              onMouseEnter={() => {
                setActiveId(transaction.id)
                liRefs.current[transaction.id]?.focus()
              }}
              role="option"
              aria-selected={activeId === transaction.id}
              ref={(li) => {
                if (li) liRefs.current[transaction.id] = li
                else delete liRefs.current[transaction.id]
              }}
            >
              {transaction.name}
            </li>
          </RovingFocusGroupItem>
        ))}
      </ol>
    </RovingFocusGroup>
  )
}

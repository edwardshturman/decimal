"use client"

// Components
import {
  RovingFocusGroup,
  RovingFocusGroupItem
} from "@radix-ui/react-roving-focus"

// Hooks
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"

// Types
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react"

import styles from "./Inbox.module.css"
import { Transaction } from "@/generated/prisma"

export function Inbox({ transactions }: { transactions: Transaction[] }) {
  function handleSelect(transaction: Transaction) {
    console.log(`Selected ${transaction.name}`)
  }
  function handleSlash(transaction: Transaction) {
    console.log(`Toggled slash for ${transaction.name}`)
  }
  function handleClick(
    event: MouseEvent<HTMLLIElement>,
    transaction: Transaction
  ) {
    handleSelect(transaction)
  }
  function handleKeyDown(
    event: KeyboardEvent<HTMLLIElement>,
    transaction: Transaction
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

  const ROW_COUNT = 11
  const PAGINATE_UP_THRESHOLD = 2
  const PAGINATE_DOWN_THRESHOLD = 8
  const [paginationStart, setPaginationStart] = useState(0)
  const [paginationEnd, setPaginationEnd] = useState(ROW_COUNT)
  const [lastInput, setLastInput] = useState<"keyboard" | "mouse">()
  useEffect(() => {
    function handleKey() {
      setLastInput("keyboard")
    }
    function handlePointerMove() {
      setLastInput("mouse")
    }
    window.addEventListener("keydown", handleKey, { passive: true })
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener("keydown", handleKey)
      window.removeEventListener("pointermove", handlePointerMove)
    }
  }, [])

  function computeOpacity(
    transactions: Transaction[],
    index: number,
    paginationStart: number,
    paginationEnd: number
  ) {
    if (index === ROW_COUNT - 1 && paginationEnd + 1 <= transactions.length)
      return 0.4
    if (index === ROW_COUNT - 2 && paginationEnd + 2 <= transactions.length)
      return 0.6
    if (index === ROW_COUNT - 3 && paginationEnd + 3 <= transactions.length)
      return 0.8
    if (index === 0 && paginationStart - index > 0) return 0.4
    if (index === 1 && paginationStart - index > 0) return 0.6
    if (index === 2 && paginationStart - index > 0) return 0.8
    else return 1
  }

  return (
    <RovingFocusGroup orientation="vertical">
      <ol
        className={styles.list}
        role="listbox"
        aria-label="Transaction Inbox"
        ref={olRef}
      >
        <div className={styles.highlight} style={highlightStyles} />
        {transactions
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(paginationStart, paginationEnd)
          .map((transaction, index) => (
            <RovingFocusGroupItem
              key={transaction.id}
              asChild
              focusable
              autoFocus={index === 0}
              onFocus={() => {
                setActiveId(transaction.id)

                if (lastInput !== "keyboard") return

                // Go down when towards the bottom of the list
                if (
                  index >= PAGINATE_DOWN_THRESHOLD &&
                  paginationEnd !== transactions.length
                ) {
                  setPaginationStart(paginationStart + 1)
                  setPaginationEnd(paginationEnd + 1)
                }

                // Go up when towards the top of the list
                if (index <= PAGINATE_UP_THRESHOLD && paginationStart !== 0) {
                  setPaginationStart(paginationStart - 1)
                  setPaginationEnd(paginationEnd - 1)
                }
              }}
            >
              <li
                className={styles.item}
                onKeyDown={(e) => handleKeyDown(e, transaction)}
                onClick={(e) => handleClick(e, transaction)}
                onMouseEnter={() => {
                  if (lastInput !== "mouse") return
                  setActiveId(transaction.id)
                  liRefs.current[transaction.id]?.focus({ preventScroll: true })
                }}
                role="option"
                aria-selected={activeId === transaction.id}
                ref={(li) => {
                  if (li) liRefs.current[transaction.id] = li
                  else delete liRefs.current[transaction.id]
                }}
                style={{
                  opacity: computeOpacity(
                    transactions,
                    index,
                    paginationStart,
                    paginationEnd
                  )
                }}
              >
                <span className={styles.date}>
                  {Intl.DateTimeFormat("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year:
                      transaction.date.getFullYear() !==
                      new Date().getFullYear()
                        ? "numeric"
                        : undefined
                  }).format(transaction.date)}
                </span>
                <span className={styles.name}>{transaction.name}</span>
                <span className={styles.amount}>
                  {Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: transaction.currencyCode
                  }).format(transaction.amount)}
                </span>
              </li>
            </RovingFocusGroupItem>
          ))}
      </ol>
    </RovingFocusGroup>
  )
}

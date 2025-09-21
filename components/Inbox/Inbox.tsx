"use client"

// Components
import {
  RovingFocusGroup,
  RovingFocusGroupItem
} from "@radix-ui/react-roving-focus"
import { motion } from "motion/react"

// Hooks
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"

// Types
import type { Variants } from "motion/react"
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

  const ROW_HEIGHT = 38
  const [activeId, setActiveId] = useState(transactions[0].id)
  const olRef = useRef<HTMLOListElement>(null)
  const liRefs = useRef<Record<string, HTMLElement>>({})
  const [highlightStyles, setHighlightStyles] = useState<CSSProperties>({
    transform: "translateY(0px)",
    height: `${ROW_HEIGHT}px`
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

  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => setHasMounted(true), [])
  const variants: Variants = {
    enter: (direction: "up" | "down") => ({
      opacity: 0,
      y: direction === "down" ? ROW_HEIGHT : -ROW_HEIGHT
    }),
    center: {
      opacity: 1,
      y: 0
    },
    exit: (direction: "up" | "down") => ({
      opacity: 0,
      y: direction === "down" ? -ROW_HEIGHT : ROW_HEIGHT
    })
  }

  const ROW_COUNT = 11
  const PAGINATE_UP_THRESHOLD = 2
  const PAGINATE_DOWN_THRESHOLD = 8
  const [paginationStart, setPaginationStart] = useState(0)
  const [paginationEnd, setPaginationEnd] = useState(ROW_COUNT)
  const [direction, setDirection] = useState<"up" | "down">("down")
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

  return (
    <RovingFocusGroup orientation="vertical">
      <div
        className={styles.chevron}
        style={{ opacity: paginationStart > 0 ? 0.4 : 0 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.4697 9.46967C11.7626 9.17678 12.2374 9.17678 12.5303 9.46967L16.5303 13.4697C16.8232 13.7626 16.8232 14.2374 16.5303 14.5303C16.2374 14.8232 15.7626 14.8232 15.4697 14.5303L12 11.0607L8.53033 14.5303C8.23744 14.8232 7.76256 14.8232 7.46967 14.5303C7.17678 14.2374 7.17678 13.7626 7.46967 13.4697L11.4697 9.46967Z"
          />
        </svg>
      </div>
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
                  setDirection("down")
                }

                // Go up when towards the top of the list
                if (index <= PAGINATE_UP_THRESHOLD && paginationStart !== 0) {
                  setPaginationStart(paginationStart - 1)
                  setPaginationEnd(paginationEnd - 1)
                  setDirection("up")
                }
              }}
            >
              <motion.li
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
                layout
                custom={direction}
                variants={variants}
                initial={hasMounted ? "enter" : false}
                animate="center"
                exit="exit"
                transition={{ duration: 0.15 }}
                style={{
                  minHeight: ROW_HEIGHT
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
              </motion.li>
            </RovingFocusGroupItem>
          ))}
      </ol>
      <div
        className={styles.chevron}
        style={{ opacity: paginationEnd < transactions.length ? 0.4 : 0 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.4697 14.5303C11.7626 14.8232 12.2374 14.8232 12.5303 14.5303L16.5303 10.5303C16.8232 10.2374 16.8232 9.76256 16.5303 9.46967C16.2374 9.17678 15.7626 9.17678 15.4697 9.46967L12 12.9393L8.53033 9.46967C8.23744 9.17678 7.76256 9.17678 7.46967 9.46967C7.17678 9.76256 7.17678 10.2374 7.46967 10.5303L11.4697 14.5303Z"
          />
        </svg>
      </div>
    </RovingFocusGroup>
  )
}

// Components
import { Button } from "@/components/Button"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

// Styles
import styles from "./SelectionBar.module.css"

export function SelectionBar({
  count,
  onOpenPalette,
  onClear
}: {
  count: number
  onOpenPalette: () => void
  onClear: () => void
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={styles.container}>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            className={styles.bar}
            initial={!shouldReduceMotion ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={!shouldReduceMotion ? { opacity: 0, y: 8 } : {}}
            transition={
              !shouldReduceMotion ? { duration: 0.15 } : { duration: 0 }
            }
            role="status"
          >
            <span className={styles.count}>
              {count} transaction{count === 1 ? "" : "s"} selected
            </span>
            <div className={styles.actions}>
              <Button onClick={onOpenPalette}>
                Actions
                <kbd className={styles.shortcut}>/</kbd>
              </Button>
              <Button onClick={onClear}>
                Clear
                <kbd className={styles.shortcut}>Esc</kbd>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Cascade } from "@/components/Cascade"
import styles from "./Button.module.css"

type ButtonProps = React.DetailedHTMLProps<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
>

export function Button({ children, ...props }: ButtonProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      className={styles.button}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      {!hovered && <span>{children}</span>}
      {hovered && <Cascade text={children as string} duration={0.3} />}
    </button>
  )
}

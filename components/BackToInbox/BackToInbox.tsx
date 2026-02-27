"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function BackToInbox() {
  const path = usePathname()

  if (path.includes("inbox")) return <></>

  return <Link href={"/inbox"}>Back</Link>
}

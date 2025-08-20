"use client"

import { Button } from "@/components/Button"
import { signOut } from "next-auth/react"

export function SignOut() {
  return <Button onClick={async () => await signOut()}>Sign out</Button>
}

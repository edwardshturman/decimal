"use client"

import { Button } from "@/components/Button"
import { signIn } from "next-auth/react"

async function handleLoginWithGoogle() {
  return await signIn("google", { callbackUrl: "/inbox" })
}

export function SignIn() {
  return <Button onClick={handleLoginWithGoogle}>Sign in with Google</Button>
}

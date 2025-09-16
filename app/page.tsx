// Functions
import { redirect } from "next/navigation"
import { auth, isAuthorized } from "@/lib/auth"

export default async function Home() {
  const session = await auth()
  const authorized = isAuthorized(session)
  if (authorized) redirect("/inbox")

  return <></>
}

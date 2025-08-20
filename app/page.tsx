// Functions
import { redirect } from "next/navigation"
import { auth, isAuthorized } from "@/lib/auth"

// Constants
import { APP_NAME } from "@/lib/constants"

// Components
import { SignIn } from "@/components/SignIn"

export default async function Home() {
  const session = await auth()
  const authorized = isAuthorized(session)
  if (authorized) redirect("/plaid")

  return (
    <>
      <h1>{APP_NAME}</h1>
      <div style={{ padding: "20px", display: "flex", gap: "16px" }}>
        <SignIn />
      </div>
    </>
  )
}

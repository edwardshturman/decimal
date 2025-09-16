import { auth } from "@/lib/auth"
import { SignIn } from "@/components/SignIn"
import { SignOut } from "@/components/SignOut"

export async function SignInOutWrapper() {
  const session = await auth()
  if (session) return <SignOut />
  return <SignIn />
}

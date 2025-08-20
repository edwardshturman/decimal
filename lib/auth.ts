import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import type { NextAuthConfig, Session } from "next-auth"
import { redirect, unauthorized } from "next/navigation"
import { createUser, getUserByEmail } from "@/functions/db/users"

if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error("Missing env var GOOGLE_CLIENT_ID")
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("Missing env var GOOGLE_CLIENT_SECRET")
}
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("Missing env var NEXTAUTH_SECRET")
}

export const authOptions: NextAuthConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.id = profile.sub
        token.picture = profile.picture
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.image = token.picture
      return session
    }
  }
}

export const {
  handlers: { GET, POST },
  auth
} = NextAuth(authOptions)

export function isAuthorized(session: Session | null) {
  const userId = session?.user?.id
  const userEmail = session?.user?.email
  if (!userId || !userEmail) return false

  const whitelistEnvVar = process.env.WHITELIST
  if (!whitelistEnvVar) {
    throw new Error("Missing env var WHITELIST")
  }
  const whitelist = whitelistEnvVar.split(",")
  if (!whitelist.includes(userEmail)) return false

  return true
}

export async function getOrCreateCurrentUser() {
  const session = await auth()
  if (!session) redirect("/")
  const authorized = isAuthorized(session)
  if (!authorized) unauthorized()

  let user = await getUserByEmail(session!.user!.email!)
  if (!user) {
    user = await createUser({
      name: session!.user!.name!,
      email: session!.user!.email!
    })
  }

  return user
}

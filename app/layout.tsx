// Constants
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"

// Types
import type { Metadata } from "next"

// Styles
import "./globals.css"
import styles from "./Page.module.css"
import { Inter, Roboto_Mono } from "next/font/google"

// Components
import { VercelToolbar } from "@vercel/toolbar/next"
import { SignInOutWrapper } from "@/components/SignInOutWrapper"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"]
})

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"]
})

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const shouldInjectToolbar = process.env.NODE_ENV === "development"
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`}>
      <body className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{APP_NAME}</h1>
          <SignInOutWrapper />
        </header>
        {children}
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  )
}

// Constants
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"

// Types
import type { Metadata } from "next"

// Styles
import "./globals.css"
import styles from "./Page.module.css"
import localFont from "next/font/local"

// Components
import { VercelToolbar } from "@vercel/toolbar/next"
import { SignInOutWrapper } from "@/components/SignInOutWrapper"
import { BackToInbox } from "@/components/BackToInbox"

const iAWriterQuattro = localFont({
  src: [
    {
      path: "../public/fonts/iAWriterQuattroS-Regular.woff2",
      weight: "400",
      style: "normal"
    },
    {
      path: "../public/fonts/iAWriterQuattroS-Italic.woff2",
      weight: "400",
      style: "italic"
    },
    {
      path: "../public/fonts/iAWriterQuattroS-Bold.woff2",
      weight: "600",
      style: "normal"
    },
    {
      path: "../public/fonts/iAWriterQuattroS-BoldItalic.woff2",
      weight: "600",
      style: "italic"
    }
  ],
  variable: "--font-ia-writer-quattro"
})

const iAWriterMono = localFont({
  src: [
    {
      path: "../public/fonts/iAWriterMonoS-Regular.woff2",
      weight: "400",
      style: "normal"
    },
    {
      path: "../public/fonts/iAWriterMonoS-Italic.woff2",
      weight: "400",
      style: "italic"
    },
    {
      path: "../public/fonts/iAWriterMonoS-Bold.woff2",
      weight: "600",
      style: "normal"
    },
    {
      path: "../public/fonts/iAWriterMonoS-BoldItalic.woff2",
      weight: "600",
      style: "italic"
    }
  ],
  variable: "--font-ia-writer-mono"
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
    <html
      lang="en"
      className={`${iAWriterQuattro.variable} ${iAWriterMono.variable}`}
    >
      <body className={styles.page}>
        <header className={styles.header}>
          <SignInOutWrapper />
          <BackToInbox />
        </header>
        {children}
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  )
}

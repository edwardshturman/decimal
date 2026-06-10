import type { NextConfig } from "next"
import { withVercelToolbar as Toolbar } from "@vercel/toolbar/plugins/next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: {
    authInterrupts: true
  }
}

const withVercelToolbar = Toolbar()

export default withVercelToolbar(nextConfig)

/**
 * Whether the app is running in development, for gating dev-only UI and the Server Actions behind it.
 * Hiding the UI is not enough on its own — Server Actions can be called directly — so each dev action checks this too.
 */
export function isDevelopment() {
  return process.env.NODE_ENV === "development"
}

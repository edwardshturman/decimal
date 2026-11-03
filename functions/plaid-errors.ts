import type { PlaidError } from "plaid"

/*
 * Plaid error handling, kept apart from `functions/plaid.ts` so it can be tested without a Plaid client, env vars, or a database.
 */

/**
 * Plaid SDK calls reject with an Axios error carrying the {@link PlaidError} as its response body.
 * The Axios error itself only reports the status code, so anything wanting to know what actually went wrong has to unwrap it.
 *
 * @param error an error thrown by a Plaid SDK call
 * @returns the Plaid error, or `null` if the error did not come from Plaid
 */
export function getPlaidError(error: unknown) {
  const data = (error as { response?: { data?: Partial<PlaidError> } })
    ?.response?.data
  if (typeof data?.error_code !== "string") return null
  return data as PlaidError
}

/**
 * @param error an error thrown by a Plaid SDK call
 * @returns the Plaid `error_code`, e.g. `ITEM_LOGIN_REQUIRED`, or `null` if the error did not come from Plaid
 */
export function getPlaidErrorCode(error: unknown) {
  return getPlaidError(error)?.error_code ?? null
}

/**
 * Formats a Plaid error for logging, since the code alone rarely says enough to act on.
 */
export function describePlaidError(plaidError: PlaidError) {
  return `${plaidError.error_code}: ${plaidError.error_message}`
}

/**
 * A failed Plaid request, stripped of everything but what's needed to understand the failure.
 *
 * The Axios errors the Plaid SDK rejects with carry the whole outgoing request — the `PLAID-CLIENT-ID` and `PLAID-SECRET` headers, and the JSON body with the Item's `access_token` — and Next.js prints all of it when an error goes uncaught.
 * This keeps only the response's `status` and `data`, the latter being the {@link PlaidError}, so {@link getPlaidError} works on it just the same.
 *
 * The original error is deliberately not attached as `cause`, since that would print it all over again.
 */
export class PlaidRequestError extends Error {
  readonly endpoint: string
  readonly code?: string
  readonly response?: { status: number; data: unknown }

  constructor({
    endpoint,
    message,
    code,
    response
  }: {
    endpoint: string
    message: string
    code?: string
    response?: { status: number; data: unknown }
  }) {
    const plaidError = getPlaidError({ response })
    super(
      `Plaid ${endpoint} failed — ${plaidError ? describePlaidError(plaidError) : message}`
    )
    this.name = "PlaidRequestError"
    this.endpoint = endpoint
    if (code !== undefined) this.code = code
    if (response) this.response = response
  }
}

type AxiosLikeError = {
  isAxiosError: true
  message: string
  code?: unknown
  config?: { url?: unknown }
  response?: { status?: unknown; data?: unknown }
}

function isAxiosError(error: unknown): error is AxiosLikeError {
  return (error as { isAxiosError?: unknown })?.isAxiosError === true
}

/**
 * @returns the path of the Plaid endpoint a request went to, e.g. `/item/get`, which is all of its URL worth keeping
 */
function getEndpoint(url: unknown) {
  if (typeof url !== "string") return "request"
  try {
    return new URL(url).pathname
  } catch {
    return "request"
  }
}

/**
 * Turns an error thrown by a Plaid SDK call into a {@link PlaidRequestError}, if it came from Axios.
 * Anything else, such as the SDK's own `RequiredError` for a missing parameter, never held the request, so it's returned untouched.
 *
 * @param error an error thrown by a Plaid SDK call
 */
export function redactPlaidError(error: unknown) {
  if (!isAxiosError(error)) return error

  // Network-level failures — timeouts, DNS, dropped connections — have no response, but are just as full of secrets
  const response = error.response
    ? {
        status:
          typeof error.response.status === "number" ? error.response.status : 0,
        data: error.response.data
      }
    : undefined

  return new PlaidRequestError({
    endpoint: getEndpoint(error.config?.url),
    message: error.message,
    code: typeof error.code === "string" ? error.code : undefined,
    response
  })
}

/**
 * Rethrows an error from a Plaid SDK call with the request redacted — see {@link PlaidRequestError}.
 * Every `client.*` call should end in `.catch(rethrowRedactedPlaidError)`.
 *
 * @param error an error thrown by a Plaid SDK call
 */
export function rethrowRedactedPlaidError(error: unknown): never {
  throw redactPlaidError(error)
}

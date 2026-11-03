import { describe, expect, test } from "bun:test"
import { inspect } from "node:util"
import { AxiosError, type InternalAxiosRequestConfig } from "axios"
import { Configuration, type PlaidError, PlaidApi } from "plaid"
import {
  getPlaidError,
  getPlaidErrorCode,
  PlaidRequestError,
  redactPlaidError,
  rethrowRedactedPlaidError
} from "@/functions/plaid-errors"

const SECRET = "test-secret-do-not-log"
const CLIENT_ID = "test-client-id-do-not-log"
const ACCESS_TOKEN = "access-sandbox-do-not-log"

const plaidErrorBody = {
  error_type: "ITEM_ERROR",
  error_code: "ITEM_LOGIN_REQUIRED",
  error_message: "the login details of this item have changed",
  display_message: null,
  request_id: "request-1"
} as PlaidError

/**
 * A Plaid client whose requests never leave the process, answered instead by `respond`.
 * Requests still go through Axios, so failures come back as genuine Axios errors, request and all — rejected the same way Axios's own adapters do.
 */
function makeClient(respond: () => Promise<{ status: number; data: unknown }>) {
  return new PlaidApi(
    new Configuration({
      basePath: "https://sandbox.plaid.invalid",
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": CLIENT_ID,
          "PLAID-SECRET": SECRET
        },
        adapter: async (config: InternalAxiosRequestConfig) => {
          const request = { config }
          let result
          try {
            result = await respond()
          } catch (error) {
            const { message, code } = error as AxiosError
            throw new AxiosError(message, code, config, request)
          }
          const response = {
            ...result,
            statusText: "",
            headers: {},
            config,
            request
          }
          if (result.status >= 400) {
            throw new AxiosError(
              `Request failed with status code ${result.status}`,
              AxiosError.ERR_BAD_REQUEST,
              config,
              request,
              response
            )
          }
          return response
        }
      }
    })
  )
}

async function catchError(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected the promise to reject")
}

function expectNoSecrets(error: unknown) {
  const printed = inspect(error, { depth: Infinity, showHidden: true })
  expect(printed).not.toContain(SECRET)
  expect(printed).not.toContain(CLIENT_ID)
  expect(printed).not.toContain(ACCESS_TOKEN)
}

describe("rethrowRedactedPlaidError", () => {
  test("an unredacted error leaks secrets, which is the whole point", async () => {
    const client = makeClient(async () => ({
      status: 400,
      data: plaidErrorBody
    }))
    const error = await catchError(
      client.itemGet({ access_token: ACCESS_TOKEN })
    )
    const printed = inspect(error, { depth: Infinity })
    expect(printed).toContain(SECRET)
    expect(printed).toContain(ACCESS_TOKEN)
  })

  test("redacts a Plaid error response, keeping the Plaid error", async () => {
    const client = makeClient(async () => ({
      status: 400,
      data: plaidErrorBody
    }))
    const error = await catchError(
      client
        .itemGet({ access_token: ACCESS_TOKEN })
        .catch(rethrowRedactedPlaidError)
    )

    expect(error).toBeInstanceOf(PlaidRequestError)
    expectNoSecrets(error)
    expect(getPlaidErrorCode(error)).toBe("ITEM_LOGIN_REQUIRED")
    expect(getPlaidError(error)).toEqual(plaidErrorBody)
    expect((error as PlaidRequestError).response?.status).toBe(400)
    expect((error as PlaidRequestError).message).toBe(
      "Plaid /item/get failed — ITEM_LOGIN_REQUIRED: the login details of this item have changed"
    )
  })

  test("redacts a network failure with no response", async () => {
    const client = makeClient(async () => {
      throw new AxiosError("socket hang up", "ECONNRESET")
    })
    const error = await catchError(
      client
        .transactionsSync({ access_token: ACCESS_TOKEN })
        .catch(rethrowRedactedPlaidError)
    )

    expect(error).toBeInstanceOf(PlaidRequestError)
    expectNoSecrets(error)
    expect(getPlaidError(error)).toBeNull()
    expect((error as PlaidRequestError).code).toBe("ECONNRESET")
    expect((error as PlaidRequestError).message).toBe(
      "Plaid /transactions/sync failed — socket hang up"
    )
  })

  test("passes successful responses through", async () => {
    const client = makeClient(async () => ({
      status: 200,
      data: { item: { item_id: "item-1" } }
    }))
    const response = await client
      .itemGet({ access_token: ACCESS_TOKEN })
      .catch(rethrowRedactedPlaidError)
    expect(response.data.item.item_id).toBe("item-1")
  })
})

describe("redactPlaidError", () => {
  test("leaves errors that didn't come from Axios alone", () => {
    const error = new Error("Required parameter missing")
    expect(redactPlaidError(error)).toBe(error)
  })
})

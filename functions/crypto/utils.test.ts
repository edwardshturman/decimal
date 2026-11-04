import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  GCM,
  decryptItemAccessToken,
  encryptAccessToken,
  encryptItemAccessToken,
  getPreviousKeys
} from "@/functions/crypto/utils"

const KEY_VARS = ["KEY_IN_USE", "KEY_VERSION", "PREVIOUS_KEYS"] as const

describe("access token key rotation", () => {
  const saved: Partial<Record<(typeof KEY_VARS)[number], string>> = {}
  const oldKey = GCM.makeKey()
  const newKey = GCM.makeKey()

  beforeEach(() => {
    for (const name of KEY_VARS) saved[name] = process.env[name]
    process.env.KEY_IN_USE = newKey
    process.env.KEY_VERSION = "2"
    process.env.PREVIOUS_KEYS = JSON.stringify({ "1": oldKey })
  })

  afterEach(() => {
    for (const name of KEY_VARS) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  test("encrypts under the current key and records its version", () => {
    const item = encryptItemAccessToken("access-token")
    expect(item.encryptionKeyVersion).toBe("2")
    expect(decryptItemAccessToken(item)).toBe("access-token")
  })

  test("decrypts a token encrypted under a previous key", () => {
    const item = {
      accessToken: encryptAccessToken("access-token", oldKey),
      encryptionKeyVersion: "1"
    }
    expect(decryptItemAccessToken(item)).toBe("access-token")
  })

  test("fails naming the version when its key is missing", () => {
    const item = {
      accessToken: encryptAccessToken("access-token", oldKey),
      encryptionKeyVersion: "0"
    }
    expect(() => decryptItemAccessToken(item)).toThrow('version "0"')
  })

  test("decrypts current-version tokens without PREVIOUS_KEYS set", () => {
    delete process.env.PREVIOUS_KEYS
    const item = encryptItemAccessToken("access-token")
    expect(decryptItemAccessToken(item)).toBe("access-token")
  })

  test("rejects PREVIOUS_KEYS with a different key for the current version", () => {
    process.env.PREVIOUS_KEYS = JSON.stringify({ "1": oldKey, "2": oldKey })
    const item = {
      accessToken: encryptAccessToken("access-token", oldKey),
      encryptionKeyVersion: "1"
    }
    expect(() => decryptItemAccessToken(item)).toThrow("current KEY_VERSION")
  })

  test("allows PREVIOUS_KEYS to repeat the current key, as partway through a rotation", () => {
    process.env.KEY_IN_USE = oldKey
    process.env.KEY_VERSION = "1"
    process.env.PREVIOUS_KEYS = JSON.stringify({ "0": newKey, "1": oldKey })
    const item = {
      accessToken: encryptAccessToken("access-token", newKey),
      encryptionKeyVersion: "0"
    }
    expect(decryptItemAccessToken(item)).toBe("access-token")
  })

  test("accepts the documented PREVIOUS_KEYS example", () => {
    process.env.KEY_VERSION = "3"
    process.env.PREVIOUS_KEYS =
      '{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","2":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="}'
    const keys = getPreviousKeys()
    expect([...keys.keys()]).toEqual(["1", "2"])
    for (const key of keys.values()) expect(() => new GCM(key)).not.toThrow()
  })

  test("rejects PREVIOUS_KEYS that aren't a version → key object", () => {
    const item = {
      accessToken: encryptAccessToken("access-token", oldKey),
      encryptionKeyVersion: "1"
    }
    process.env.PREVIOUS_KEYS = "not json"
    expect(() => decryptItemAccessToken(item)).toThrow("not valid JSON")
    process.env.PREVIOUS_KEYS = JSON.stringify([oldKey])
    expect(() => decryptItemAccessToken(item)).toThrow("JSON object")
    process.env.PREVIOUS_KEYS = JSON.stringify({ "1": 1 })
    expect(() => decryptItemAccessToken(item)).toThrow("non-string key")
  })
})

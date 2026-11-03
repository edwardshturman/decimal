import { randomBytes, createCipheriv, createDecipheriv } from "crypto"

// Types
import type { Item } from "@/generated/prisma/client"

export class GCM {
  /**
    "If the IV is created randomly at each invocation, the birthday paradox kicks in with 96 bit nonces too.
    You will need to invoke the cipher with the same key no more than 2^32 times in all cases."
    https://crypto.stackexchange.com/questions/41601/aes-gcm-recommended-iv-size-why-12-bytes
   */

  /**
    https://medium.com/@bh03051999/aes-gcm-encryption-and-decryption-for-python-java-and-typescript-562dcaa96c22
   */

  private key: Buffer
  private static readonly ALGORITHM = "aes-256-gcm"
  private static readonly IV_LEN = 12
  private static readonly TAG_LEN = 16
  private static readonly KEY_LEN = 32

  constructor(keyBase64: string) {
    if (!keyBase64 || !GCM.isValidKey(keyBase64)) {
      throw new Error(
        `Invalid key (or missing): must be base64 and exactly ${GCM.KEY_LEN} bytes after decoding.`
      )
    }
    this.key = Buffer.from(keyBase64, "base64")
  }

  private static isValidKey(keyBase64: string): boolean {
    try {
      const key = Buffer.from(keyBase64, "base64")
      return key.length === GCM.KEY_LEN
    } catch {
      return false
    }
  }

  public encrypt(plainText: string): string {
    try {
      const iv = randomBytes(GCM.IV_LEN)

      const cipher = createCipheriv(GCM.ALGORITHM, this.key, iv)

      const encrypted = Buffer.concat([
        cipher.update(String(plainText), "utf-8"),
        cipher.final()
      ])

      const tag = cipher.getAuthTag()
      return Buffer.concat([iv, encrypted, tag]).toString("base64")
    } catch (err) {
      throw new Error(`Encryption failed: ${(err as Error).message}`)
    }
  }

  public decrypt(cipherText: string): string {
    try {
      const stringValue = Buffer.from(String(cipherText), "base64")

      const iv = stringValue.slice(0, GCM.IV_LEN)
      const encrypted = stringValue.slice(
        GCM.IV_LEN,
        stringValue.length - GCM.TAG_LEN
      )
      const tag = stringValue.slice(-GCM.TAG_LEN)

      const decipher = createDecipheriv(GCM.ALGORITHM, this.key, iv)

      decipher.setAuthTag(tag)
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ])
      return decrypted.toString("utf-8")
    } catch (err) {
      throw new Error(`Decryption failed: ${(err as Error).message}`)
    }
  }

  static makeKey(): string {
    return randomBytes(32).toString("base64")
  }
}

export function encryptAccessToken(plainText: string, encryptionKey: string) {
  return new GCM(encryptionKey).encrypt(plainText)
}

export function decryptAccessToken(cipherText: string, encryptionKey: string) {
  return new GCM(encryptionKey).decrypt(cipherText)
}

/*
 * Access tokens are encrypted under the current key, `KEY_IN_USE`, and each Item records the version of the key its token was encrypted under — the value of `KEY_VERSION` at the time.
 *
 * To rotate keys:
 * 1. Add the outgoing key to `PREVIOUS_KEYS` — a JSON object mapping key versions to base64 keys, e.g. `{"1":"…"}` — under its current `KEY_VERSION`
 * 2. Set `KEY_IN_USE` to the new key, and `KEY_VERSION` to a new version
 * 3. Run `scripts/reencrypt-access-tokens.ts` to move every Item onto the new key
 * 4. Once it reports no Items left on an old version, drop that version from `PREVIOUS_KEYS`
 */

/**
 * @returns the version of the key new access tokens are encrypted under
 */
export function getCurrentKeyVersion() {
  const version = process.env.KEY_VERSION
  if (!version) throw new Error("Missing KEY_VERSION!")
  return version
}

function getCurrentKey() {
  const key = process.env.KEY_IN_USE
  if (!key) throw new Error("Missing KEY_IN_USE!")
  return key
}

/**
 * Parses `PREVIOUS_KEYS`, the keys rotated out of use that Items may still have tokens encrypted under.
 *
 * @returns a map of key version to base64 key
 */
function getPreviousKeys() {
  const previousKeys = new Map<string, string>()
  const raw = process.env.PREVIOUS_KEYS
  if (!raw) return previousKeys

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("PREVIOUS_KEYS is not valid JSON!")
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error(
      "PREVIOUS_KEYS must be a JSON object mapping key versions to base64 keys!"
    )

  for (const [version, key] of Object.entries(parsed)) {
    if (typeof key !== "string")
      throw new Error(
        `PREVIOUS_KEYS has a non-string key for version "${version}"!`
      )
    previousKeys.set(version, key)
  }

  // The same version naming two keys would make it ambiguous which one a token was encrypted under
  const currentVersion = getCurrentKeyVersion()
  if (previousKeys.has(currentVersion))
    throw new Error(
      `PREVIOUS_KEYS must not include the current KEY_VERSION, "${currentVersion}"!`
    )

  return previousKeys
}

/**
 * @param version the key version recorded on an Item
 * @returns the base64 key for that version
 */
function getKeyForVersion(version: string) {
  if (version === getCurrentKeyVersion()) return getCurrentKey()

  const key = getPreviousKeys().get(version)
  if (!key)
    throw new Error(
      `No encryption key for version "${version}" — add it to PREVIOUS_KEYS. Was it retired before every Item using it was re-encrypted?`
    )
  return key
}

/**
 * Encrypts an access token under the current key, for storing on an Item.
 *
 * @param accessToken the plaintext access token
 * @returns the Item fields to store: the encrypted token, and the version of the key it was encrypted under
 */
export function encryptItemAccessToken(
  accessToken: string
): Pick<Item, "accessToken" | "encryptionKeyVersion"> {
  return {
    accessToken: encryptAccessToken(accessToken, getCurrentKey()),
    encryptionKeyVersion: getCurrentKeyVersion()
  }
}

/**
 * Decrypts the access token stored on an Item, with the key for the Item's `encryptionKeyVersion`.
 * Every Item token is decrypted through here.
 *
 * Throws if no key is configured for that version. That's a deployment misconfiguration rather than anything wrong with the Item — and reconnecting couldn't fix it, since update mode needs the token too — so callers let it propagate instead of recording it against the Item the way they do a Plaid error.
 *
 * @param item the Item whose access token to decrypt, as stored in the database
 * @returns the plaintext access token
 */
export function decryptItemAccessToken(
  item: Pick<Item, "accessToken" | "encryptionKeyVersion">
) {
  return decryptAccessToken(
    item.accessToken,
    getKeyForVersion(item.encryptionKeyVersion)
  )
}

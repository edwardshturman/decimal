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

export function encryptAccessToken(
  plainText: string,
  encryptionKey: string,
  encryptionKeyVersion: string
): {
  cipherText: string
  keyVersion: string
} {
  // GCM class handles missing/invalid keys, but version is also a must
  if (!encryptionKey || !encryptionKeyVersion)
    throw new Error("Missing encryption key or key version!")

  // Encrypt token prior to DB insert
  const encrypted = new GCM(encryptionKey).encrypt(plainText)

  return { cipherText: encrypted, keyVersion: encryptionKeyVersion }
}

export function decryptAccessToken(
  cipherText: string,
  encryptionKey: string,
  encryptionKeyVersion: string
): {
  plainText: string
  keyVersion: string
} {
  // GCM class handles missing/invalid keys, but version is also a must
  if (!encryptionKey || !encryptionKeyVersion)
    throw new Error("Missing encryption key or key version!")

  // Encrypt token prior to DB insert
  const decrypted = new GCM(encryptionKey).decrypt(cipherText)

  return { plainText: decrypted, keyVersion: encryptionKeyVersion }
}

/**
 * Decrypts the access token stored on an Item.
 * Every Item token is decrypted through here, so that choosing the key by the Item's `encryptionKeyVersion` — needed before keys can be rotated — is a change in one place.
 *
 * @param item the Item whose access token to decrypt, as stored in the database
 * @returns the plaintext access token
 */
export function decryptItemAccessToken(
  item: Pick<Item, "accessToken" | "encryptionKeyVersion">
) {
  const encryptionKey = process.env.KEY_IN_USE!
  const { plainText } = decryptAccessToken(
    item.accessToken,
    encryptionKey,
    item.encryptionKeyVersion
  )
  return plainText
}

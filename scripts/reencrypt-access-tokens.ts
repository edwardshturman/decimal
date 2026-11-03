/**
 * Re-encrypts the access token of every Item not on the current key version, so old keys can be retired.
 * See the key rotation steps in `functions/crypto/utils.ts`.
 *
 * Usage:
 *   bun run reencrypt-tokens:dev [--dry-run]
 *   bun run reencrypt-tokens:deploy [--dry-run]
 *
 * `--dry-run` decrypts every token to check its key is configured, without writing anything.
 * Safe to re-run: Items already on the current version are skipped.
 */

import prisma from "@/functions/db"
import {
  decryptItemAccessToken,
  encryptItemAccessToken,
  getCurrentKeyVersion
} from "@/functions/crypto/utils"

const dryRun = process.argv.includes("--dry-run")
const currentVersion = getCurrentKeyVersion()

const items = await prisma.item.findMany({
  where: { encryptionKeyVersion: { not: currentVersion } },
  select: { id: true, accessToken: true, encryptionKeyVersion: true }
})
console.log(
  `${items.length} Item(s) not on the current key version, "${currentVersion}"`
)

let reencrypted = 0
let failed = 0
for (const item of items) {
  const transition = `"${item.encryptionKeyVersion}" → "${currentVersion}"`
  try {
    const update = encryptItemAccessToken(decryptItemAccessToken(item))
    if (dryRun) {
      console.log(`Would re-encrypt Item ${item.id}, ${transition}`)
      continue
    }

    // Matching on the token read above means one replaced in the meantime, e.g. by a concurrent run, isn't clobbered
    const { count } = await prisma.item.updateMany({
      where: {
        id: item.id,
        accessToken: item.accessToken,
        encryptionKeyVersion: item.encryptionKeyVersion
      },
      data: update
    })
    if (count === 0) {
      console.log(`Skipped Item ${item.id}: changed since it was read`)
      continue
    }

    reencrypted++
    console.log(`Re-encrypted Item ${item.id}, ${transition}`)
  } catch (error) {
    failed++
    console.error(
      `Failed to re-encrypt Item ${item.id}, ${transition}: ${(error as Error).message}`
    )
  }
}

if (!dryRun) console.log(`Re-encrypted ${reencrypted} Item(s)`)
if (failed > 0) console.error(`${failed} Item(s) failed`)

const remaining = await prisma.item.groupBy({
  by: ["encryptionKeyVersion"],
  where: { encryptionKeyVersion: { not: currentVersion } },
  _count: true
})
if (remaining.length === 0)
  console.log(
    "No Items left on an old key version — PREVIOUS_KEYS can be emptied"
  )
else
  for (const { encryptionKeyVersion, _count } of remaining)
    console.log(
      `${_count} Item(s) still on key version "${encryptionKeyVersion}"`
    )

await prisma.$disconnect()
if (failed > 0) process.exit(1)

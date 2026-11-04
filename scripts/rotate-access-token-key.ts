/**
 * Rotates the key Plaid access tokens are encrypted under, across the linked Vercel project.
 * See the rotation steps in `functions/crypto/utils.ts`; this automates them.
 *
 * Usage:
 *   bun run key:rotate [--version <new version>] [--yes]
 *   bun run key:retire [--yes]
 *
 * `key:rotate` (steps 1–3):
 * 1. Adds the current key to `PREVIOUS_KEYS`, and checks it landed before going further, so the old key is never lost
 * 2. Generates a new key, and sets `KEY_IN_USE` and `KEY_VERSION` to it — the version is incremented unless `--version` is given
 * 3. Redeploys production so it runs with the new keys, then re-encrypts every Item in the production and development databases
 *
 * `key:retire` (step 4) drops each version in `PREVIOUS_KEYS` that no Item in either database is still on, then redeploys production.
 * It's separate so that anything still writing with an old key — e.g. a Preview deployment built before the rotation — has time to be caught by re-running the re-encryption first.
 *
 * Assumes, and checks, that `KEY_IN_USE`, `KEY_VERSION` and `PREVIOUS_KEYS` are the same across Production, Preview and Development.
 * Secrets are read through `vercel env run` and written through stdin, so they never appear in arguments, files, or output — only SHA-256 fingerprints are printed.
 * Requires the Vercel CLI, logged in, with this directory linked to the project.
 */

import { createHash } from "crypto"
import {
  GCM,
  getCurrentKey,
  getCurrentKeyVersion,
  getPreviousKeys
} from "@/functions/crypto/utils"

const ENVIRONMENTS = ["production", "preview", "development"] as const
type Environment = (typeof ENVIRONMENTS)[number]

// Preview shares Production's database, so these cover every database
const DATABASE_ENVIRONMENTS = ["production", "development"] as const

// Kept out of child processes, so each one only sees the values `vercel env run` gives it
const PROJECT_VARIABLES = [
  "KEY_IN_USE",
  "KEY_VERSION",
  "PREVIOUS_KEYS",
  "DATABASE_URL"
]

const SNAPSHOT_MARKER = "__KEY_SNAPSHOT__"

/**
 * The key configuration of one environment, and the Items in its database by key version.
 * Only `secrets` holds actual keys, and only when asked for.
 */
type Snapshot = {
  keyVersion: string
  keyFingerprint: string
  previousKeysSet: boolean
  previousKeyFingerprints: Record<string, string>
  itemCounts: Record<string, number>
  secrets?: { key: string; previousKeys: Record<string, string> }
}

// ======================================================================
// Pure helpers

export function fingerprint(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 12)
}

/**
 * @param currentVersion the current `KEY_VERSION`
 * @param usedVersions every version that is, or has been, in use: in `PREVIOUS_KEYS`, or on an Item
 * @param requestedVersion the version passed with `--version`, if any
 * @returns the version to give the new key
 */
export function chooseNextKeyVersion(
  currentVersion: string,
  usedVersions: string[],
  requestedVersion?: string
) {
  const version =
    requestedVersion ??
    (/^\d+$/.test(currentVersion)
      ? String(Number(currentVersion) + 1)
      : undefined)
  if (!version)
    throw new Error(
      `Can't increment key version "${currentVersion}" — pass --version <new version>`
    )
  if (version === currentVersion || usedVersions.includes(version))
    throw new Error(`Key version "${version}" has already been used`)
  return version
}

/**
 * @param previousVersions the versions in `PREVIOUS_KEYS`
 * @param itemCounts the Items in each database, by key version
 * @returns the previous versions no Item in any database is on
 */
export function findRetirableVersions(
  previousVersions: string[],
  itemCounts: Record<string, number>[]
) {
  return previousVersions.filter((version) =>
    itemCounts.every((counts) => !counts[version])
  )
}

// ======================================================================
// Running in an environment

/**
 * Prints the key configuration of the environment this process was started in, for the parent process to read.
 */
async function printSnapshot(withSecrets: boolean) {
  const key = getCurrentKey()
  const previousKeys = getPreviousKeys()
  for (const k of [key, ...previousKeys.values()]) new GCM(k)

  const { default: prisma } = await import("@/functions/db")
  const groups = await prisma.item.groupBy({
    by: ["encryptionKeyVersion"],
    _count: true
  })
  await prisma.$disconnect()

  const snapshot: Snapshot = {
    keyVersion: getCurrentKeyVersion(),
    keyFingerprint: fingerprint(key),
    previousKeysSet: process.env.PREVIOUS_KEYS !== undefined,
    previousKeyFingerprints: Object.fromEntries(
      [...previousKeys].map(([version, k]) => [version, fingerprint(k)])
    ),
    itemCounts: Object.fromEntries(
      groups.map((group) => [group.encryptionKeyVersion, group._count])
    ),
    secrets: withSecrets
      ? { key, previousKeys: Object.fromEntries(previousKeys) }
      : undefined
  }
  console.log(SNAPSHOT_MARKER + JSON.stringify(snapshot))
}

function childEnv() {
  const env = { ...process.env }
  for (const name of PROJECT_VARIABLES) delete env[name]
  return env
}

async function run(command: string[], stdin?: string) {
  const child = Bun.spawn(command, {
    env: childEnv(),
    stdin: stdin === undefined ? "inherit" : new Blob([stdin]),
    stdout: "inherit",
    stderr: "inherit"
  })
  const exitCode = await child.exited
  // Only the first few words, which never include a secret
  if (exitCode !== 0)
    throw new Error(
      `\`${command.slice(0, 4).join(" ")} …\` exited with code ${exitCode}`
    )
}

async function capture(command: string[]) {
  const child = Bun.spawn(command, {
    env: childEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit"
  })
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited
  ])
  if (exitCode !== 0)
    throw new Error(
      `\`${command.slice(0, 4).join(" ")} …\` exited with code ${exitCode}`
    )
  return stdout
}

async function inspect(environment: Environment, withSecrets = false) {
  const stdout = await capture([
    "vercel",
    "env",
    "run",
    "--environment",
    environment,
    "--",
    process.execPath,
    "--no-env-file",
    import.meta.path,
    "snapshot",
    ...(withSecrets ? ["--with-secrets"] : [])
  ])
  const line = stdout
    .split("\n")
    .find((line) => line.startsWith(SNAPSHOT_MARKER))
  if (!line)
    throw new Error(`Couldn't read the key configuration of ${environment}`)
  return JSON.parse(line.slice(SNAPSHOT_MARKER.length)) as Snapshot
}

async function inspectAll() {
  const snapshots = {} as Record<Environment, Snapshot>
  for (const environment of ENVIRONMENTS)
    snapshots[environment] = await inspect(
      environment,
      environment === "production"
    )
  return snapshots
}

function describeKeys(snapshot: Snapshot) {
  const previous = Object.entries(snapshot.previousKeyFingerprints)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([version, fp]) => `"${version}" (${fp})`)
    .join(", ")
  return `current "${snapshot.keyVersion}" (${snapshot.keyFingerprint}), previous: ${previous || "none"}`
}

function sameKeys(a: Snapshot, b: Snapshot) {
  return describeKeys(a) === describeKeys(b)
}

function assertConsistent(snapshots: Record<Environment, Snapshot>) {
  for (const environment of ENVIRONMENTS) {
    if (sameKeys(snapshots[environment], snapshots.production)) continue
    throw new Error(
      `Key configuration differs between environments, which this script doesn't handle:\n` +
        ENVIRONMENTS.map(
          (env) => `  ${env}: ${describeKeys(snapshots[env])}`
        ).join("\n")
    )
  }
}

/**
 * Checks every environment now has the expected keys, by fingerprint.
 */
async function verify(
  expected: Omit<Snapshot, "itemCounts" | "previousKeysSet">
) {
  for (const environment of ENVIRONMENTS) {
    const snapshot = await inspect(environment)
    if (!sameKeys(snapshot, { ...snapshot, ...expected }))
      throw new Error(
        `${environment} doesn't have the expected keys.\n  Expected: ${describeKeys({ ...snapshot, ...expected })}\n  Found:    ${describeKeys(snapshot)}`
      )
  }
}

/**
 * Sets a variable in every environment, from stdin so the value stays out of the process list.
 *
 * The type is always `config`, like the existing key variables. Left to infer it, the CLI may make a secret-looking name like `PREVIOUS_KEYS` a Secret, which Development can't hold and `vercel env run` can't read back.
 */
async function setVariable(
  name: string,
  value: string,
  existsIn: Environment[]
) {
  for (const environment of existsIn)
    await run(
      [
        "vercel",
        "env",
        "update",
        name,
        "--environment",
        environment,
        "--type",
        "config",
        "--yes"
      ],
      value
    )

  const missingFrom = ENVIRONMENTS.filter((env) => !existsIn.includes(env))
  if (missingFrom.length > 0)
    await run(
      [
        "vercel",
        "env",
        "add",
        name,
        "--environment",
        missingFrom.join(","),
        "--type",
        "config",
        "--yes"
      ],
      value
    )
}

async function getLatestProductionDeployment() {
  const stdout = await capture([
    "vercel",
    "list",
    "--environment",
    "production",
    "--status",
    "READY",
    "--json",
    "--limit",
    "1",
    "--yes"
  ])
  const { deployments } = JSON.parse(stdout.slice(stdout.indexOf("{"))) as {
    deployments: { url: string; meta?: { githubCommitSha?: string } }[]
  }
  const deployment = deployments[0]
  if (!deployment) throw new Error("No ready Production deployment found")
  return { url: deployment.url, sha: deployment.meta?.githubCommitSha }
}

/**
 * Redeploying Production rebuilds its current commit, so that commit has to be one that can decrypt with `PREVIOUS_KEYS` — otherwise rotating would break every Item.
 */
async function assertProductionSupportsPreviousKeys(sha: string | undefined) {
  if (!sha)
    throw new Error(
      "The Production deployment isn't from a Git commit, so its code can't be checked for PREVIOUS_KEYS support. Deploy from main first."
    )
  await run(["git", "fetch", "--quiet", "origin", sha])
  const source = await capture([
    "git",
    "show",
    `${sha}:functions/crypto/utils.ts`
  ])
  if (!source.includes("PREVIOUS_KEYS"))
    throw new Error(
      `Production (${sha.slice(0, 7)}) predates PREVIOUS_KEYS support, so it can't decrypt Items on an old key. Deploy a commit with it first.`
    )
}

async function redeployProduction() {
  const before = await getLatestProductionDeployment()
  console.log(`\nRedeploying Production (${before.url})…`)
  await run(["vercel", "redeploy", before.url, "--environment", "production"])
  const after = await getLatestProductionDeployment()
  if (after.url === before.url)
    throw new Error(
      "Production redeploy didn't produce a new ready deployment — check the Vercel dashboard, e.g. for a skipped build"
    )
  console.log(`Production is now ${after.url}`)
}

async function reencryptAllDatabases() {
  for (const environment of DATABASE_ENVIRONMENTS) {
    console.log(`\nRe-encrypting Items in the ${environment} database…`)
    await run([
      "vercel",
      "env",
      "run",
      "--environment",
      environment,
      "--",
      process.execPath,
      "--no-env-file",
      `${import.meta.dir}/reencrypt-access-tokens.ts`
    ])
  }
}

function confirm(plan: string[], yes: boolean) {
  console.log(`\n${plan.join("\n")}\n`)
  if (yes) return
  const answer = prompt("Continue? [y/N]")
  if (answer?.trim().toLowerCase() !== "y") {
    console.log("Aborted, nothing changed")
    process.exit(0)
  }
}

function getFlag(name: string) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

// ======================================================================
// Commands

async function rotate({ yes, version }: { yes: boolean; version?: string }) {
  console.log("Reading key configuration…")
  const snapshots = await inspectAll()
  assertConsistent(snapshots)
  const production = snapshots.production
  const secrets = production.secrets!

  const usedVersions = [
    ...Object.keys(production.previousKeyFingerprints),
    ...DATABASE_ENVIRONMENTS.flatMap((env) =>
      Object.keys(snapshots[env].itemCounts)
    )
  ]
  const oldVersion = production.keyVersion
  const newVersion = chooseNextKeyVersion(oldVersion, usedVersions, version)
  const newKey = GCM.makeKey()
  const previousKeys = { ...secrets.previousKeys, [oldVersion]: secrets.key }
  const previousKeyFingerprints = {
    ...production.previousKeyFingerprints,
    [oldVersion]: production.keyFingerprint
  }

  const deployment = await getLatestProductionDeployment()
  await assertProductionSupportsPreviousKeys(deployment.sha)

  confirm(
    [
      `Rotating the access token key, in ${ENVIRONMENTS.join(", ")}:`,
      `  Current: ${describeKeys(production)}`,
      `  1. Add key "${oldVersion}" (${production.keyFingerprint}) to PREVIOUS_KEYS`,
      `  2. Set KEY_IN_USE to a new key (${fingerprint(newKey)}), and KEY_VERSION to "${newVersion}"`,
      `  3. Redeploy Production (${deployment.url}), then re-encrypt Items in the ${DATABASE_ENVIRONMENTS.join(" and ")} databases`
    ],
    yes
  )

  // 1. The old key has to be safely in PREVIOUS_KEYS before KEY_IN_USE is overwritten, or it'd be lost along with every token under it
  console.log("\nAdding the current key to PREVIOUS_KEYS…")
  await setVariable(
    "PREVIOUS_KEYS",
    JSON.stringify(previousKeys),
    ENVIRONMENTS.filter((env) => snapshots[env].previousKeysSet)
  )
  await verify({
    keyVersion: oldVersion,
    keyFingerprint: production.keyFingerprint,
    previousKeyFingerprints
  })

  // 2. KEY_IN_USE goes first: stopped in between, the old version would name the new key, which fails loudly on decrypt. The other way round, new tokens would be encrypted under the old key but labelled with the new version — a silent mismatch
  console.log("\nSetting the new key…")
  try {
    await setVariable("KEY_IN_USE", newKey, [...ENVIRONMENTS])
    await setVariable("KEY_VERSION", newVersion, [...ENVIRONMENTS])
    await verify({
      keyVersion: newVersion,
      keyFingerprint: fingerprint(newKey),
      previousKeyFingerprints
    })
  } catch (error) {
    console.error(
      `\nFailed partway through setting the new key. The old key is safe in PREVIOUS_KEYS under "${oldVersion}", but don't deploy until KEY_IN_USE and KEY_VERSION agree — either finish by hand, or restore KEY_IN_USE from PREVIOUS_KEYS["${oldVersion}"] and KEY_VERSION to "${oldVersion}", and remove "${oldVersion}" from PREVIOUS_KEYS.`
    )
    throw error
  }

  // 3. Production has to be running with the new keys first, or it couldn't decrypt the Items as they're re-encrypted
  await redeployProduction()
  await reencryptAllDatabases()

  console.log(
    [
      `\nRotated to key version "${newVersion}". Next:`,
      "  - Run `bun run refresh` to pull the new keys, or local development can't decrypt the re-encrypted Items",
      "  - Redeploy any Preview deployment you still use — those built before now have the old keys, and can't decrypt Items on the new one",
      `  - Once nothing could still be writing with key "${oldVersion}", run \`bun run key:retire\``
    ].join("\n")
  )
}

async function retire({ yes }: { yes: boolean }) {
  console.log("Reading key configuration…")
  const snapshots = await inspectAll()
  assertConsistent(snapshots)
  const production = snapshots.production
  const secrets = production.secrets!

  const previousVersions = Object.keys(production.previousKeyFingerprints)
  const itemCounts = DATABASE_ENVIRONMENTS.map(
    (env) => snapshots[env].itemCounts
  )
  const retirable = findRetirableVersions(previousVersions, itemCounts)

  for (const version of previousVersions.filter(
    (v) => !retirable.includes(v)
  )) {
    const counts = DATABASE_ENVIRONMENTS.map(
      (env) => `${snapshots[env].itemCounts[version] ?? 0} in ${env}`
    ).join(", ")
    console.log(
      `Keeping key "${version}": Items still on it (${counts}) — re-run the re-encryption with \`bun run reencrypt-tokens:deploy\` / \`:dev\``
    )
  }
  if (retirable.length === 0) {
    console.log("No previous keys to retire")
    return
  }

  const remainingKeys = Object.fromEntries(
    Object.entries(secrets.previousKeys).filter(
      ([version]) => !retirable.includes(version)
    )
  )
  const remainingFingerprints = Object.fromEntries(
    Object.entries(production.previousKeyFingerprints).filter(
      ([version]) => !retirable.includes(version)
    )
  )

  confirm(
    [
      `Retiring key version(s) ${retirable.map((v) => `"${v}" (${production.previousKeyFingerprints[v]})`).join(", ")}, which no Item is on:`,
      `  1. Remove them from PREVIOUS_KEYS, in ${ENVIRONMENTS.join(", ")}`,
      "  2. Redeploy Production, so it no longer has them"
    ],
    yes
  )

  await setVariable("PREVIOUS_KEYS", JSON.stringify(remainingKeys), [
    ...ENVIRONMENTS
  ])
  await verify({
    keyVersion: production.keyVersion,
    keyFingerprint: production.keyFingerprint,
    previousKeyFingerprints: remainingFingerprints
  })
  await redeployProduction()

  console.log(
    [
      `\nRetired key version(s) ${retirable.map((v) => `"${v}"`).join(", ")}. Next:`,
      "  - Run `bun run refresh` to pull the change locally",
      "  - Older deployments keep the env they were built with, retired keys included — delete any you need rid of"
    ].join("\n")
  )
}

if (import.meta.main) {
  const command = process.argv[2]
  const yes = process.argv.includes("--yes")
  try {
    if (command === "snapshot")
      await printSnapshot(process.argv.includes("--with-secrets"))
    else if (command === "rotate")
      await rotate({ yes, version: getFlag("--version") })
    else if (command === "retire") await retire({ yes })
    else {
      console.error(
        "Usage: bun run key:rotate [--version <new version>] [--yes] | bun run key:retire [--yes]"
      )
      process.exit(1)
    }
  } catch (error) {
    console.error(`\n${(error as Error).message}`)
    process.exit(1)
  }
}

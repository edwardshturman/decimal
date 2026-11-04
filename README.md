# Decimal

A minimalist, web-based expense tracker.

## Local Development

1. Copy the environment file and populate it with your secrets:

  ```zsh
  cp .env.example .env.local
  ```

2. Install the dependencies:

  ```zsh
  bun install
  ```

3. Connect to a cloud database provider, or set up a local PostgreSQL database:

  ```zsh
  docker run --name postgres -e POSTGRES_PASSWORD=password -p "5432:5432" postgres
  ```

4. Run a migration to set up the database schema:

  ```zsh
  bun migrate
  ```

5. Run the local development server:

  ```zsh
  bun run dev
  ```

## Encryption Keys

Plaid access tokens are encrypted at rest with AES-256-GCM (`functions/crypto/utils.ts`). Three environment variables hold the keys:

| Variable | Contents |
| --- | --- |
| `KEY_IN_USE` | The base64 key new tokens are encrypted under. Generate one with `openssl rand -base64 32` |
| `KEY_VERSION` | A label for that key, e.g. `1`, recorded on each Item as its `encryptionKeyVersion` |
| `PREVIOUS_KEYS` | Optional. Older keys that Items may still be encrypted under, as a JSON object of version → key, e.g. `{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}` |

Each Item's token is decrypted with the key for its own version. If no key is configured for that version, the request fails with an error naming the version.

On Vercel, all three are shared across Production, Preview and Development. Preview uses Production's database; Development has its own.

### Rotating the key

Requires the [Vercel CLI](https://vercel.com/docs/cli), logged in, with this directory linked to the project. Only run it once Production is on a commit that supports `PREVIOUS_KEYS`; the script checks this.

1. Rotate:

  ```zsh
  bun run key:rotate
  ```

  This shows its plan and asks before changing anything. Then it:
  - adds the current key to `PREVIOUS_KEYS`, and checks every environment has it before going further, so the old key can't be lost
  - generates a new key, sets `KEY_IN_USE` and `KEY_VERSION` (incremented, or pass `--version <version>`), and checks again
  - redeploys Production so it runs with the new keys
  - re-encrypts every Item in both databases onto the new key

  Secrets go through `vercel env run` and stdin, never arguments, files or output. Only short SHA-256 fingerprints of keys are printed.

2. Run `bun run refresh` to pull the new keys. Until you do, local development can't decrypt the re-encrypted Items.

3. Redeploy any Preview deployment you still use. Ones built before the rotation have the old keys, so they can't decrypt Items on the new one, and anything they link is encrypted under the old key.

4. Retire the old key:

  ```zsh
  bun run key:retire
  ```

  This removes every version in `PREVIOUS_KEYS` that no Item in either database is still on, then redeploys Production. Any version still in use is kept, and the script lists its Items. Move those with `bun run reencrypt-tokens:deploy` (Production database) or `bun run reencrypt-tokens:dev` (Development database), then retire again.

Pass `--yes` to either command to skip the confirmation. Deployments built before the retirement keep the env they were built with, retired keys included, so delete any you need rid of.

If `key:rotate` fails partway through setting the new key, its error says how to recover. Don't deploy until `KEY_IN_USE` and `KEY_VERSION` agree.

### Re-encrypting tokens

`bun run reencrypt-tokens:deploy` and `bun run reencrypt-tokens:dev` re-encrypt every Item not on the current key version, in the Production or Development database. `key:rotate` runs both. They're safe to re-run, and `--dry-run` checks every token can be decrypted without writing anything.

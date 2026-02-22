# Guide to the `edwardshturman/decimal` codebase for Claude Code

This project (named Decimal, for the moment) is a minimalist, web-based expense tracker

## Technical details of the project

### Tech stack

- Node version: 24.x
- Package manager: Bun
  - All installs, invocations, and scripts should use `bun`, e.g. `bun i`, `bun add`, `bun run`, `bunx`
  - All packages should be pinned to their exact SemVer
- Language: TypeScript (strict mode)
- Framework: Next.js 16 (App Router) with Turbopack
- Database: Postgres via Prisma ORM
- Banking API: Plaid
- Auth: Google OAuth via NextAuth

### Code style

- No semicolons in JavaScript/TypeScript files
- No trailing commas
- Path alias: `@/*` maps to root directory
- ESLint enforces Next.js best practices and React hooks rules

### Architecture

#### Components

- Generally, all reusable components live in `components/`
- All styling is done with CSS Modules
- Each component has its own directory, with:
  - The actual component file, e.g. `Inbox.tsx`
  - A CSS Modules file, e.g. `Inbox.module.css`
  - An `index.ts` re-exporting the file

### Directories

- Server Actions (form submissions, Plaid operations, or other mutations) are stored in `functions/actions.ts`
- Plaid SDK wrapper functions (Link token exchange, calling endpoints like Transactions Sync, etc.) are stored in `functions/plaid.ts`
- The data layer, oen file per model, is written in `db/`
- The database schema configuration & migrations are in `prisma/`
- Plaid access tokens are encrypted with AES-256-GCM in `crypto/utils.ts`
- Some shared utilities like constants & authentication can be found in `lib/`

### Data model

The Plaid data model can get confusing, and if ever unsure, you should consult their documentation, in addition to this brief primer:

User → Item (a connection to a financial institution) → Account (bank account) → Transaction. Each Account has an optional Cursor for incremental syncing, à la pagination. Transaction IDs are unique to Item-Account pairs.

## Heuristics

### Committing work

- Never commit or push unless explicitly instructed — always offer the user a chance to review first

### Answering questions

- When being asked a question, do not make any changes unless instructed to
- When the user uses language like "isn't it the case that [...]?", do not blindly accept the proposition. They are simply asking you a question. Assess the truthfulness of their premises & soundness of any arguments, and ultimately, answer the question

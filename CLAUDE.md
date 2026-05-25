# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A **data liberation sync engine** that extracts Gmail data via OAuth 2.0 into Supabase and exposes a REST API. Gmail messages are pushed in real time via Pub/Sub webhooks (no polling), normalized to the `Message` shape defined in `CONTRACT.md`, and persisted in Supabase PostgreSQL. The REST API is deployed as Vercel Serverless Functions at `/api/v1`.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript — strict mode, `"strict": true` in `tsconfig.json` |
| Gmail integration | `googleapis` npm package — OAuth 2.0 client + Gmail API |
| Database client | `@supabase/supabase-js` v2 |
| Testing | Jest + Supertest + `ts-jest` |
| Deployment | Vercel Serverless Functions |

## Two-session architecture

The build is split across two git branches with non-overlapping ownership:

| Session | Branch | Owns |
|---|---|---|
| Server Logic | `main` | `src/`, `api/`, `tests/` |
| Schema | `schema` | `migrations/`, `types/` |

**Sequencing rule: the schema branch cannot be merged until `npm test` exits 0 on `main`.**

The schema session authors migration SQL and shared TypeScript types in isolation. It does not touch `src/` or `api/`. The server logic session does not apply migrations to any database. See `CONTRACT.md §2` for the full gate definition.

## Key documents

- **`CONTRACT.md`** — acceptance criteria, all four endpoint contracts (request/response shapes, typed error codes), the `Message` data model with Gmail API field mappings, and the two-session sequencing rule.
- **`build_sequence.md`** — seven atomic build units in order, each with a one-sentence verify check that must pass before the next unit starts.

Read both files before writing any code.

## Commands

```bash
npm test                        # Jest suite — must exit 0 before the schema branch is merged
npx tsc --noEmit                # Type-check without emitting; must exit 0 at all times
vercel dev                      # Local preview of all Vercel Functions on port 3000
npx jest --testPathPattern=foo  # Run a single test file matching "foo"
```

The `test` script in `package.json` is a placeholder — configure `ts-jest` before running tests.

## Architecture

The project deploys as **Vercel Serverless Functions** (no Express). TypeScript compiles from two source roots:

- **`src/`** — all business logic. Follows the build sequence: provider abstraction interface → Gmail OAuth + token persistence → sync/read layer → PubSub webhook receiver → send layer.
- **`api/`** — Vercel Function entry points only. Each file maps to one route. These are thin handlers that call into `src/` and return responses; no business logic lives here.
- **`tests/`** — Jest test suite (Unit 7 in the build sequence).

Output goes to `dist/`. Both `src/` and `api/` are included in the TypeScript compilation (`tsconfig.json` `include`).

## Coding conventions

- All error responses use the envelope shape from `CONTRACT.md`: `{ error: { code, message, details? } }` — no bare strings, no HTML error pages.
- All list endpoints use cursor-based pagination (Gmail `pageToken` as cursor). No offset pagination.
- All client-facing endpoints use the `/api/v1` base path.
- All endpoints except `GET /api/v1/auth/google/callback` require `Authorization: Bearer <jwt>`.
- The Pub/Sub webhook endpoint lives at **`/webhook/gmail`** — it is not under `/api/v1` and does not require a JWT; it validates the `GOOGLE_PUBSUB_VERIFICATION_TOKEN` instead.

## Never do

- **Never use `any` as a TypeScript type.** Use `unknown` and narrow it, or define the correct interface.
- **Never poll the Gmail API for new messages.** All message ingestion is event-driven via Pub/Sub push webhooks that deliver a `historyId`; the sync layer then calls `history.list` for the delta.
- **Never store OAuth tokens in plain text.** Tokens are stored in Supabase and must never appear in logs, error responses, or unencrypted columns.
- **Never make Gmail API calls manually with raw `fetch` or `axios`.** Always use the `googleapis` OAuth2 client, which handles token refresh automatically.
- **Never write to `src/db/` from the schema session branch.** That folder is owned by `main`.
- **Never merge the schema branch before `npm test` exits 0.**
- **Never hardcode credentials.** Every secret is consumed from environment variables.

## Gmail API notes

All message reads use `messages.get(id, { format: 'FULL' })`. Headers (`From`, `To`, `Subject`, `Date`) are extracted from `message.payload.headers[]` by name (case-insensitive). Body parts are found by `mimeType` (`text/plain` / `text/html`) in `message.payload.parts[]` and base64url-decoded; for single-part messages fall back to `message.payload.body.data`. `isRead` and `isStarred` are derived from `labelIds` at write time — do not store them as independent source fields.

Required OAuth scope: `https://www.googleapis.com/auth/gmail.modify`.

## Supabase

Use `SUPABASE_SERVICE_ROLE_KEY` (not the anon key) for all server-side writes. The migration SQL must not be applied to any database until `npm test` exits 0.

## Environment variables

All required variables are in `.env.example`. The non-obvious ones:

| Variable | Purpose |
|---|---|
| `GOOGLE_PUBSUB_TOPIC` | Full Pub/Sub topic name for Gmail push notifications |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | Shared secret to validate inbound Pub/Sub push payloads |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — bypasses RLS; server-only |
| `ENCRYPTION_KEY` | 64-char hex string (32 bytes) — AES-256-GCM key for encrypting OAuth tokens at rest |
| `FRONTEND_URL` | OAuth callback redirects here after issuing the JWT |

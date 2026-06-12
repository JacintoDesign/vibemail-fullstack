# VibeMail

A full-stack **Gmail data-liberation engine** with a glassmorphic email client on top of it. VibeMail extracts your Gmail data via OAuth 2.0 into your own Supabase PostgreSQL database, keeps it in sync in real time through Gmail Pub/Sub push notifications (no polling), and exposes it through a typed REST API. A Next.js single-page app consumes that API as a fast, keyboard-driven mail client.

The whole thing — API + web UI — deploys as a single Vercel project.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [The sync engine](#the-sync-engine)
- [REST API](#rest-api)
- [Frontend](#frontend)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Setup](#setup)
- [Running locally](#running-locally)
- [Database & migrations](#database--migrations)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Key documents](#key-documents)

---

## What it does

**Backend (data liberation + API)**
- OAuth 2.0 sign-in with Google; access/refresh tokens stored **encrypted at rest** (AES-256-GCM) in Supabase.
- Initial sync pulls your inbox into Supabase, normalized to a stable `Message` shape.
- Real-time ingestion via **Gmail Pub/Sub push webhooks** — a notification delivers a `historyId`, the sync layer calls `history.list` for the delta. No polling, ever.
- **Backfill** older history beyond the initial seed, and **reconcile** to drop stale labels so the local inbox tracks Gmail exactly.
- Full REST API at `/api/v1`: list, read, send, search, threads, drafts, labels, attachments.
- Daily cron renews the Gmail watch before it expires (~7 days).

**Frontend (the mail client)**
- Three-pane desktop layout + responsive mobile shell, glassmorphic theming, nebula background.
- Read / star / archive / trash / mark-unread, add & remove labels, bulk actions.
- Compose, reply-in-thread, drafts (create / edit / send / delete), attachments (upload & download).
- Cursor-paginated message list with background auto-sync that fills the inbox to its true size.
- Cmd-K search, keyboard shortcuts, pop-out thread windows.

---

## Architecture

```
                       ┌──────────────────────────────────────────────┐
   Google OAuth  ─────▶│  api/v1/auth/google/* — consent + callback    │
                       │  issues a 7-day HS256 JWT                      │
                       └──────────────────────────────────────────────┘
                                          │
   Gmail Pub/Sub  ──push──▶  /webhook/gmail ──▶ history.list ──┐
                                                               ▼
   ┌────────────┐   REST /api/v1    ┌──────────────┐   googleapis   ┌─────────┐
   │ Next.js    │ ◀───────────────▶ │ Vercel funcs │ ◀────────────▶ │  Gmail  │
   │ app/ (SPA) │   Bearer JWT      │ api/ + src/  │   OAuth2 client │  API    │
   └────────────┘                   └──────┬───────┘                └─────────┘
                                           │ @supabase/supabase-js (service role)
                                           ▼
                                    ┌──────────────┐
                                    │  Supabase    │  users + messages
                                    │  PostgreSQL  │  + Storage (attachments)
                                    └──────────────┘
```

The TypeScript codebase compiles from **two source roots**, kept deliberately thin:

- **`src/`** — all business logic (provider abstraction → Gmail OAuth + token persistence → sync/read → Pub/Sub webhook → send/drafts → attachments).
- **`api/`** — Vercel Function entry points only. One file per route; thin handlers that authenticate, validate, call into `src/`, and return the response envelope. No business logic.
- **`app/`** — the Next.js App-Router frontend. It talks to `api/` over the relative `/api/v1` base path, so the SPA and API are same-origin.

Everything ships as **Vercel Serverless Functions** (no Express server). `vercel dev` serves the Next app and the `api/` functions together on one port.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript (strict mode) |
| Frontend | Next.js 15 (App Router), React 19, Motion, lucide-react |
| Gmail integration | `googleapis` — OAuth 2.0 client + Gmail API |
| Database / Storage | Supabase (PostgreSQL + Storage), `@supabase/supabase-js` v2 |
| Auth | Google OAuth 2.0 → HS256 JWT (`jsonwebtoken`) |
| Token encryption | AES-256-GCM (Node `crypto`) |
| Testing | Jest + Supertest + `ts-jest` (live Supabase, mocked Gmail) |
| Deployment | Vercel (Serverless Functions + Cron) |

---

## Repository layout

```
vibemail-fullstack/
├── api/                          # Vercel Function entry points (one file per route)
│   ├── v1/
│   │   ├── auth/google/          # OAuth initiate + callback
│   │   ├── messages.ts           # GET list · POST send
│   │   ├── messages/[id]/        # GET/PATCH/DELETE message · POST/DELETE labels
│   │   ├── messages/search.ts    # GET search
│   │   ├── threads/[threadId].ts # GET thread (oldest-first)
│   │   ├── drafts.ts             # POST create draft
│   │   ├── drafts/[id]/          # PATCH update · DELETE · POST send
│   │   ├── labels.ts             # GET Gmail label catalog + counts
│   │   ├── attachments.ts        # POST signed upload URL · GET signed download
│   │   └── sync/                 # POST backfill · POST reconcile
│   ├── webhook/gmail.ts          # Pub/Sub push receiver (mounted at /webhook/gmail)
│   └── cron/renew-watch.ts       # Daily Gmail watch renewal
│
├── src/                          # All business logic
│   ├── providers/gmail/          # OAuth, token encryption/persistence, drafts
│   ├── sync/                     # initial sync, backfill, reconcile, normalize
│   ├── send/                     # RFC-2822 compose + send
│   ├── attachments/              # Supabase Storage signed up/downloads
│   ├── webhook/gmail.ts          # history.list delta processing
│   ├── cron/renewWatch.ts        # watch-renewal logic
│   ├── db/                       # Supabase data layer (service-role)
│   ├── middleware/               # jwt verify/sign · error envelope
│   └── types/                    # Message, provider, generated DB types
│
├── app/                          # Next.js frontend (App Router)
│   ├── page.tsx, layout.tsx      # entry + root layout
│   ├── auth/callback/            # OAuth redirect lands here, extracts the JWT
│   ├── components/               # VibeMailApp shell, ds/ design system, mail/ views
│   ├── lib/                      # api-client, api, data-source, auth, types
│   ├── providers/                # AuthProvider, SettingsProvider
│   └── styles/ + globals.css     # tokens, glass module, theme
│
├── tests/                        # Jest suite (integration + unit)
├── migrations/                   # Supabase schema SQL (owned by the schema branch)
├── docs/                         # design specs + Postman collection
├── CONTRACT.md                   # API contract — single source of truth
├── build_sequence.md             # the 7 atomic build units
├── vercel.json                   # rewrites + cron
├── tsconfig.json                 # backend (src/ + api/)
├── tsconfig.next.json            # frontend (app/)
└── tsconfig.test.json            # tests
```

---

## Data model

One row per Gmail message per user in the `messages` table, normalized to the `Message` shape (full field-by-field mapping in [`CONTRACT.md §3`](CONTRACT.md#3-data-model-message)):

- **Identity:** `gmailId` (Gmail message id — the `:id` path param for action endpoints), `threadId`, `labelIds`.
- **Headers:** `from`, `to`, `subject`, `date` (extracted from `payload.headers[]` by name).
- **Content:** `snippet`, `bodyPlain`, `bodyHtml` (body parts found by `mimeType` and base64url-decoded; single-part messages fall back to `payload.body.data`).
- **Derived flags (computed from `labelIds` at write time — never client-supplied):**
  - `isRead` = `!labelIds.includes('UNREAD')`
  - `isStarred` = `labelIds.includes('STARRED')`
  - `status` priority: `draft` → `trash` → `sent` → `archived` → `inbox`
- **`draftId`** — the Gmail `drafts.id`; required for `drafts.update`/`drafts.delete`, cleared to `null` when a draft is sent.

`status` and `draftId` are **server-managed only**. The `messages` table is indexed for newest-first pagination (`user_id, created_at DESC`), label filtering (GIN on `label_ids`), thread lookups, and status filtering. Row-Level Security is enabled as defence-in-depth (the server uses the service-role key, which bypasses it).

---

## The sync engine

Message data flows in through four independent mechanisms that together keep Supabase a faithful mirror of Gmail:

| Mechanism | Trigger | What it does |
|---|---|---|
| **Initial sync** | First OAuth sign-in | Seeds the newest ~50 INBOX messages (`messages.list` + `messages.get` FULL → normalize → upsert). |
| **Pub/Sub webhook** | Gmail push notification | Decodes the `historyId`, calls `history.list` for the delta, upserts new/changed messages (label changes included). The only real-time path. |
| **Backfill** | `POST /api/v1/sync/backfill` | Resumable, capped walk of **older** INBOX history beyond the seed. Resume state (Gmail `pageToken` + running count) is encoded in the returned cursor — the cap is enforced statelessly, so no extra schema is needed. Idempotent (`upsert` on `gmail_id`). |
| **Reconcile** | `POST /api/v1/sync/reconcile` | Lists Gmail's *live* inbox (ids only — cheap) and strips the `INBOX` label from rows Gmail no longer lists (archived/trashed), recomputing `status`. Self-sent mail (`SENT`+`INBOX`) is preserved. Closes the gap that append-only sync can't see. |

In the UI these are wired together: the inbox **auto-completes in the background** up to its true size (backfill the gap, page the rest from the DB), and **reconciles on entry/refresh** so the loaded count matches Gmail. The Gmail watch is renewed daily by a Vercel cron (`api/cron/renew-watch.ts`, schedule `0 6 * * *`) before its ~7-day expiry.

> **Never poll.** All ingestion of *new* mail is event-driven via Pub/Sub. Backfill/reconcile are explicit, on-demand, bounded operations.

---

## REST API

- **Base path:** `/api/v1` · **Auth:** `Authorization: Bearer <jwt>` on every endpoint except the OAuth callback.
- **Error envelope** (every non-2xx): `{ "error": { "code": "SCREAMING_SNAKE_CASE", "message": "...", "details?": ... } }` — no bare strings, no HTML.
- **Pagination:** cursor-based (Gmail `pageToken` style); list responses carry `nextCursor` (and `endCursor`). No offset pagination.
- **Path `:id`** on message/draft action routes is the **Gmail message id** (`gmailId`), not the Supabase row UUID.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/auth/google` | Begin OAuth — redirect to Google consent (`access_type=offline`, `prompt=consent`) |
| GET | `/api/v1/auth/google/callback` | Exchange code, upsert user, issue JWT, redirect to `FRONTEND_URL/auth/callback?token=…` |
| GET | `/api/v1/messages` | List messages (`cursor`, `limit` 1–100, `labelId`, `status`) → `{ messages, nextCursor, endCursor }` |
| POST | `/api/v1/messages` | Compose + send (optionally in-thread, with `attachmentIds`) |
| GET | `/api/v1/messages/search` | Substring search over subject/from/snippet/to (`q`, `cursor`, `limit`) |
| GET | `/api/v1/messages/:id` | Fetch a single message |
| PATCH | `/api/v1/messages/:id` | Actions: `read` / `starred` / `archived` / `trashed` (any combination) |
| DELETE | `/api/v1/messages/:id` | Hard-delete a non-draft message (Gmail trash + row drop) |
| POST | `/api/v1/messages/:id/labels` | Add a label |
| DELETE | `/api/v1/messages/:id/labels` | Remove a label |
| GET | `/api/v1/threads/:threadId` | All messages in a thread, oldest-first |
| GET | `/api/v1/labels` | Gmail label catalog with per-label message/thread + unread counts |
| POST | `/api/v1/drafts` | Create a Gmail draft (`status='draft'`, `draftId` populated) |
| PATCH | `/api/v1/drafts/:id` | Update a draft (reassigns `gmailId`) |
| DELETE | `/api/v1/drafts/:id` | Delete the Gmail draft + Supabase row atomically |
| POST | `/api/v1/drafts/:id/send` | Send the draft (`draftId→null`, `gmailId` updated, `status='sent'`) |
| POST | `/api/v1/attachments` | Get a short-lived **signed upload URL** (client PUTs bytes straight to Storage, ≤25 MB) |
| GET | `/api/v1/attachments` | Get a signed **download URL** for a received-mail attachment |
| POST | `/api/v1/sync/backfill` | Backfill older inbox history (resumable, capped) |
| POST | `/api/v1/sync/reconcile` | Drop stale `INBOX` labels so the count matches Gmail |
| POST | `/webhook/gmail` | Pub/Sub push receiver — validates `GOOGLE_PUBSUB_VERIFICATION_TOKEN`, **no JWT** |
| GET | `/api/cron/renew-watch` | Daily Gmail watch renewal (Vercel Cron) |

Full request/response shapes and every typed error code live in **[`CONTRACT.md`](CONTRACT.md)**. A ready-to-import **[Postman collection](docs/vibemail-api.postman_collection.json)** is in `docs/`.

---

## Frontend

The `app/` SPA is the reference client for the API.

- **Auth flow:** the OAuth callback redirects to `app/auth/callback/`, which extracts `?token=<jwt>` and stores it in `localStorage` under `vm-token`. Every request goes through `app/lib/api-client.ts`, which attaches `Authorization: Bearer <token>` and uses the relative `/api/v1` base.
- **Data seam:** `app/lib/api.ts` (typed wrappers over every endpoint + wire→UI mappers) and `app/lib/data-source.ts` (folder/search fetchers, backfill & reconcile helpers) are the only modules that know the wire shape.
- **Shell:** `app/components/VibeMailApp.tsx` holds mailbox state, pagination, the background auto-sync/reconcile, live-inbox polling, and compose/draft flows.
- **Views:** `app/components/mail/` — `Sidebar`, `MessageList`, `ReadingPane`, `ComposeDrawer`, `ThreadWindow` (pop-outs), `BulkActionBar`, `LabelPicker`, `KeyboardHelp`.
- **Design system:** `app/components/ds/` plus `app/styles/tokens.css` and `glass.module.css` — glassmorphic, light/dark, nebula background.

---

## Prerequisites

- **Node.js 24+** and npm
- A **Google Cloud** project with the Gmail API enabled, OAuth credentials, and a Pub/Sub topic
- A **Supabase** project (URL + service-role key)
- **Vercel CLI** (`npm i -g vercel`, or use the bundled dev dependency) for local full-stack dev

---

## Environment variables

Copy `.env.example` and fill in. All secrets are consumed from the environment — nothing is hardcoded.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client id |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:3000/api/v1/auth/google/callback`) |
| `GOOGLE_PUBSUB_TOPIC` | Full Pub/Sub topic name for Gmail push (`projects/<id>/topics/<topic>`) |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | Shared secret validating inbound Pub/Sub pushes |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server-only**, bypasses RLS |
| `JWT_SECRET` | HS256 signing secret for the session JWT |
| `ENCRYPTION_KEY` | 64-char hex (32 bytes) — AES-256-GCM key for OAuth tokens at rest |
| `FRONTEND_URL` | Where the OAuth callback redirects after issuing the JWT |

> Required Gmail OAuth scope: `https://www.googleapis.com/auth/gmail.modify`.

---

## Setup

### 1. Google Cloud

1. Create a project and **enable the Gmail API** and **Pub/Sub API**.
2. Create **OAuth 2.0 credentials** (Web application). Add your redirect URI to the authorized list and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`.
3. Create a **Pub/Sub topic** for Gmail notifications; grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on it. Set `GOOGLE_PUBSUB_TOPIC`.
4. Add a **push subscription** pointing at `https://<your-domain>/webhook/gmail`, and set `GOOGLE_PUBSUB_VERIFICATION_TOKEN` to match what the subscription sends.

### 2. Supabase

1. Create a project; copy the URL and **service-role** key.
2. Apply the schema (see [Database & migrations](#database--migrations)). The `attachments` Storage bucket is created automatically on first use.

### 3. Secrets

```bash
cp .env.example .env
# generate a 32-byte hex encryption key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# generate a JWT secret:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Install

```bash
npm install
```

---

## Running locally

| Command | What it runs |
|---|---|
| `vercel dev` | **Full stack** — Next app + all `api/` functions on one port (use this to exercise the API from the UI) |
| `npm run web:dev` | Frontend only (`next dev`) — API calls 404 unless a backend is running |
| `npm run build` | Type-check/compile the backend (`tsc`) |
| `npm run web:build` / `web:start` | Production Next build / start |
| `npm test` | Jest suite (`--runInBand`) |
| `npx tsc -p tsconfig.json --noEmit` | Type-check the backend |
| `npx tsc -p tsconfig.next.json --noEmit` | Type-check the frontend |

For full local development, run **`vercel dev`** — it serves the SPA and the serverless functions together so the frontend's relative `/api/v1` calls resolve.

> For the Pub/Sub webhook to reach you locally, expose your dev server with a tunnel (e.g. `ngrok`) and point the push subscription at the tunnel's `/webhook/gmail`.

---

## Database & migrations

Schema SQL lives in `migrations/`, applied in order:

- `001_initial_schema.sql` — `users` + `messages` tables, `updated_at` triggers, indexes, RLS policies.
- `002_add_status_and_draft_id.sql` — adds `status` + `draft_id`, backfills `status` from existing `label_ids`, adds supporting indexes.

Every migration is **idempotent** (`IF NOT EXISTS`, guarded policy creation, non-overlapping backfills) — running it twice is a no-op with no data loss.

Apply with the Supabase CLI:

```bash
npm run db:push          # supabase db push
npm run db:types         # regenerate src/types/database.ts from the linked project
```

**Two-session sequencing rule (project convention).** The repo is built across two branches with non-overlapping ownership: `main` owns `src/`, `api/`, `tests/`; the `schema` branch owns `migrations/` and shared types. **The schema branch is not merged — and migrations are not applied to any database — until `npm test` exits 0 on `main`.** See [`CONTRACT.md §2`](CONTRACT.md#2-two-session-build-sequencing-rule).

---

## Testing

```bash
npm test                              # full suite, serialized
npx jest --testPathPatterns=reconcile # a single file by pattern
```

- **Integration tests** (`tests/integration/`) run against a **live Supabase** test project (real user/message rows seeded and cleaned up) with the **Gmail API mocked** at the `googleapis` boundary and `loadOAuth2Client` stubbed.
- **Unit tests** (`tests/unit/`) cover normalization, middleware, and raw-message building.
- Jest config: `ts-jest`, 30 s per-test timeout (live DB headroom), `clearMocks`/`restoreMocks` on.

`npm test` must exit 0 with **zero failures and zero skips**, and `tsc --noEmit` must be clean, before any schema work merges (CONTRACT.md acceptance criteria AC-6/AC-7).

---

## Deployment

Deploys as one **Vercel** project. `vercel.json` wires:

- **Build:** `next build` (the `app/` SPA); `api/` functions are detected automatically.
- **Rewrite:** `/webhook/gmail` → `/api/webhook/gmail` (so the public webhook path isn't under `/api/v1` and skips JWT auth — it validates the Pub/Sub token instead).
- **Cron:** `GET /api/cron/renew-watch` daily at `0 6 * * *` (UTC) to renew the Gmail watch.

Set every variable from [Environment variables](#environment-variables) in the Vercel project settings, point your Google OAuth redirect URI and Pub/Sub push subscription at the deployed domain, and apply the migrations to your Supabase project.

---

## Security

- **OAuth tokens encrypted at rest** — AES-256-GCM via `ENCRYPTION_KEY`; ciphertext only ever lives in Supabase, never in logs, responses, or plaintext columns.
- **Service-role key is server-only** — there is no browser Supabase client; the SPA reaches data exclusively through the JWT-guarded API.
- **Every endpoint except the OAuth callback requires a Bearer JWT.** The webhook validates a shared Pub/Sub token instead.
- **No hardcoded credentials** — all secrets come from the environment.
- **RLS enabled** on both tables as defence-in-depth.
- **Typed error envelopes** never leak internals; unknown errors collapse to a generic 500.

---

## Key documents

- **[`CONTRACT.md`](CONTRACT.md)** — the API contract: acceptance criteria, every endpoint's request/response shape and typed error codes, the `Message` data model, and the two-session rule. The single source of truth.
- **[`build_sequence.md`](build_sequence.md)** — the seven atomic build units, each with a verify check.
- **[`CLAUDE.md`](CLAUDE.md)** — conventions and guardrails for working in this repo.
- **[`docs/`](docs/)** — design specs and the Postman collection.
```

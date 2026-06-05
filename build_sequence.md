# VibeMail Engine — Atomic Build Sequence

Each unit must pass its verify check before the next unit begins.

---

## Unit 1 — Provider Abstraction Interface

Define the TypeScript interface that all email provider implementations must satisfy. This is the foundation every subsequent unit builds against — no Gmail-specific code leaks past this boundary.

**Verify:** `tsc --noEmit` exits 0 and the interface declares all methods required by CONTRACT.md (list, send, markRead, OAuth token exchange, token refresh).

---

## Unit 2 — Gmail OAuth Layer with Token Persistence

Implement the Google OAuth 2.0 authorization flow: initiate, callback, token exchange, and token refresh. Persist access and refresh tokens to Supabase against the authenticated user row. The initiation step must call `generateAuthUrl` with `access_type: 'offline'` and `prompt: 'consent'` — without `access_type: 'offline'` Google does not issue a refresh token. Wire `oauth2Client.on('tokens', callback)` immediately after constructing the OAuth2 client; this event fires on every silent token refresh and the callback must upsert the new access token to Supabase, otherwise the stored token drifts.

**Verify:** OAuth flow completes end-to-end, both access and refresh tokens are written to Supabase, the `tokens` event fires during a forced refresh and the updated access token is persisted back to Supabase, and a subsequent Gmail API call after expiry succeeds without a token mismatch error.

---

## Unit 3 — Sync and Read Layer

Implement the initial message sync: call `messages.list` + `messages.get` for each result, normalize the Gmail response to the `Message` shape defined in CONTRACT.md, and upsert into Supabase. Normalization must derive `isRead`, `isStarred`, and `status` from `labelIds` at write time using `deriveStatus()`.

**Verify:** Initial sync fetches 50 messages and every stored `Message` row matches the CONTRACT.md §3 data model field-for-field, including `isRead`, `isStarred`, `status`, and `draftId` (null for non-draft messages).

---

## Unit 4 — PubSub Webhook Receiver

Implement the Gmail Push Notification endpoint: receive a Pub/Sub push payload, decode the `historyId` from the notification, call `history.list` for the delta since the last known `historyId`, and upsert new or changed messages into Supabase. The upsert must write all Message fields including `status` and `draft_id`.

**Verify:** A real or replayed Pub/Sub notification triggers the receiver, the correct `history.list` call is made using the notification's `historyId`, and the resulting delta is stored accurately with correct `status` values.

---

## Unit 5 — Send Layer

Implement message composition and delivery via `messages.send`: accept `to`, `subject`, `body`, and optional `threadId`, encode the RFC 2822 message, send via Gmail API on behalf of the authenticated user, and persist the sent message to Supabase with `status = 'sent'`.

**Verify:** A message sends successfully via the Gmail API on behalf of an authenticated user and the sent `Message` record appears in Supabase with `status = 'sent'` and `draft_id = null`.

---

## Unit 6 — Vercel API Function Entry Points

Wire all eleven route handlers from CONTRACT.md §4 as Vercel Serverless Functions. Apply JWT middleware to all authenticated routes.

| Endpoint | File |
|---|---|
| `GET  /api/v1/auth/google/callback` | `api/v1/auth/google/callback.ts` |
| `GET  /api/v1/messages` | `api/v1/messages.ts` |
| `POST /api/v1/messages` | `api/v1/messages.ts` |
| `PATCH /api/v1/messages/:id` | `api/v1/messages/[id].ts` |
| `GET  /api/v1/messages/search` | `api/v1/messages/search.ts` |
| `GET  /api/v1/threads/:threadId` | `api/v1/threads/[threadId].ts` |
| `POST /api/v1/drafts` | `api/v1/drafts.ts` |
| `PATCH /api/v1/drafts/:id` | `api/v1/drafts/[id]/index.ts` |
| `DELETE /api/v1/drafts/:id` | `api/v1/drafts/[id]/index.ts` |
| `POST /api/v1/drafts/:id/send` | `api/v1/drafts/[id]/send.ts` |

**Verify:** All eleven endpoints respond correctly in `vercel dev` local preview — correct status codes, correct response shapes, and correct error envelopes on bad input.

---

## Unit 7 — Integration Tests

Write the full Jest integration suite covering every endpoint contract and every named error code in CONTRACT.md §4 against a live Supabase instance. The schema migration (adding `status` and `draft_id` columns) must be applied to the test database before this unit can pass.

Test files:
- `tests/integration/auth.callback.test.ts` — §4.1
- `tests/integration/messages.list.test.ts` — §4.2
- `tests/integration/messages.send.test.ts` — §4.3
- `tests/integration/messages.actions.test.ts` — §4.5
- `tests/integration/messages.search.test.ts` — §4.7
- `tests/integration/threads.view.test.ts` — §4.6
- `tests/integration/drafts.create.test.ts` — §4.8
- `tests/integration/drafts.update.delete.send.test.ts` — §4.9, §4.10, §4.11
- `tests/integration/webhook.handler.test.ts` — webhook receiver
- `tests/integration/webhook.logic.test.ts` — webhook processing logic
- `tests/unit/middleware.test.ts` — JWT and error middleware
- `tests/unit/normalize.test.ts` — normalizeMessage, deriveStatus

**Verify:** `npm test` exits 0 with zero failures and zero skipped tests against a live Supabase instance with the schema migration applied.

---

*Sequencing note: Units 1–6 constitute Session 1 of the two-session build (see CONTRACT.md §2). Unit 7 is the Session 1 gate. The schema migration must be applied to the test database before Unit 7 can pass, but must not be applied to production until Unit 7 passes.*

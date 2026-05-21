# VibeMail Engine — Atomic Build Sequence

Each unit must pass its verify check before the next unit begins.

---

## Unit 1 — Provider Abstraction Interface

Define the TypeScript interface that all email provider implementations must satisfy. This is the foundation every subsequent unit builds against — no Gmail-specific code leaks past this boundary.

**Verify:** `tsc --noEmit` exits 0 and the interface declares all methods required by CONTRACT.md (list, send, markRead, OAuth token exchange, token refresh).

---

## Unit 2 — Gmail OAuth Layer with Token Persistence

Implement the Google OAuth 2.0 authorization flow: initiate, callback, token exchange, and token refresh. Persist access and refresh tokens to Supabase against the authenticated user row.

**Verify:** OAuth flow completes end-to-end, tokens are written to Supabase, and a forced token refresh returns a new access token without a mismatch error.

---

## Unit 3 — Sync and Read Layer

Implement the initial message sync: call `messages.list` + `messages.get` for each result, normalize the Gmail response to the `Message` shape defined in CONTRACT.md, and upsert into Supabase.

**Verify:** Initial sync fetches 50 messages and every stored `Message` row matches the CONTRACT.md data model field-for-field, including derived `isRead` and `isStarred` flags.

---

## Unit 4 — PubSub Webhook Receiver

Implement the Gmail Push Notification endpoint: receive a Pub/Sub push payload, decode the `historyId` from the notification, call `history.list` for the delta since the last known `historyId`, and upsert new or changed messages into Supabase.

**Verify:** A real or replayed Pub/Sub notification triggers the receiver, the correct `history.list` call is made using the notification's `historyId`, and the resulting delta is stored accurately.

---

## Unit 5 — Send Layer

Implement message composition and delivery via `messages.send`: accept `to`, `subject`, `body`, and optional `threadId`, encode the RFC 2822 message, send via Gmail API on behalf of the authenticated user, and persist the sent message to Supabase.

**Verify:** A message sends successfully via the Gmail API on behalf of an authenticated user and the sent `Message` record appears in Supabase.

---

## Unit 6 — Vercel API Function Entry Points

Wire all four route handlers from CONTRACT.md §4 as Vercel Serverless Functions: `GET /api/v1/auth/google/callback`, `GET /api/v1/messages`, `POST /api/v1/messages`, `PATCH /api/v1/messages/:id`. Apply JWT middleware to the three authenticated routes.

**Verify:** All four endpoints respond correctly in `vercel dev` local preview — correct status codes, correct response shapes, and correct error envelopes on bad input.

---

## Unit 7 — Integration Tests

Write the full Jest integration suite covering every endpoint contract and every named error code in CONTRACT.md §4 against a live Supabase instance (not mocked).

**Verify:** `npm test` exits 0 with zero failures and zero skipped tests against a live Supabase instance.

---

*Sequencing note: Units 1–6 constitute Session 1 of the two-session build (see CONTRACT.md §2). Unit 7 is the Session 1 gate. The Supabase schema migration is not applied to any database until Unit 7 passes.*

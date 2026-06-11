# VibeMail Engine — Contract

> This document is the single source of truth for the VibeMail backend.  
> Nothing ships until every criterion below is met. Schema is not merged until the Session 1 gate passes.

---

## Table of Contents

1. [Acceptance Criteria](#1-acceptance-criteria)
2. [Two-Session Build Sequencing Rule](#2-two-session-build-sequencing-rule)
3. [Data Model: Message](#3-data-model-message)
4. [Endpoint Contracts](#4-endpoint-contracts)
   - [4.1 OAuth Callback](#41-oauth-callback----get-apiv1authgooglecallback)
   - [4.2 Message List](#42-message-list----get-apiv1messages)
   - [4.3 Message Send](#43-message-send----post-apiv1messages)
   - [4.4 Mark as Read](#44-mark-as-read----patch-apiv1messagesid)
   - [4.5 Message Actions](#45-message-actions----patch-apiv1messagesid-extended)
   - [4.6 Thread View](#46-thread-view----get-apiv1threadsthreadid)
   - [4.7 Message Search](#47-message-search----get-apiv1messagessearch)
   - [4.8 Draft Create](#48-draft-create----post-apiv1drafts)
   - [4.9 Draft Update](#49-draft-update----patch-apiv1draftsid)
   - [4.10 Draft Delete](#410-draft-delete----delete-apiv1draftsid)
   - [4.11 Draft Send](#411-draft-send----post-apiv1draftsidsend)

---

## 1. Acceptance Criteria

The project is **complete** when all nine criteria are simultaneously true:

| # | Criterion | Verifiable by |
|---|---|---|
| AC-1 | `GET /api/v1/auth/google/callback` completes the OAuth flow and issues a valid JWT | Jest + manual OAuth flow |
| AC-2 | `GET /api/v1/messages` returns a paginated message list with a `nextCursor` field | Jest |
| AC-3 | `POST /api/v1/messages` delivers an email via Gmail API and persists the sent message in Supabase | Jest |
| AC-4 | `PATCH /api/v1/messages/:id` modifies Gmail labels and the `isRead`, `isStarred`, `status` fields update in Supabase | Jest |
| AC-5 | Every error case listed in §4 returns the documented HTTP status and `{ error: { code, message, details? } }` shape — no bare strings, no HTML | Jest |
| AC-10 | `GET /api/v1/threads/:threadId` returns all messages in a thread ordered oldest-first | Jest |
| AC-11 | `GET /api/v1/messages/search` returns a filtered message list matching the `q` param | Jest |
| AC-12 | `POST /api/v1/drafts` creates a Gmail draft and persists it with `status = 'draft'` in Supabase | Jest |
| AC-13 | `PATCH /api/v1/drafts/:id` updates a Gmail draft and reflects the change in Supabase | Jest |
| AC-14 | `DELETE /api/v1/drafts/:id` deletes the Gmail draft and removes the Supabase row atomically | Jest |
| AC-15 | `POST /api/v1/drafts/:id/send` sends the draft via Gmail and transitions the Supabase row to `status = 'sent'` with `draftId` cleared | Jest |
| AC-6 | `npm test` exits 0 with zero failures and zero skipped tests | CI |
| AC-7 | `tsc --noEmit` exits 0 with zero type errors | CI |
| AC-8 | No credentials appear in source code — every secret is consumed from environment variables | Code review |
| AC-9 | The Supabase migration SQL is idempotent: running it twice on the same database produces no error and no data loss | Manual verification |

---

## 2. Two-Session Build Sequencing Rule

The build is divided into two ordered sessions. **Session 2 cannot begin until the Session 1 gate is cleared.**

### Session 1 — Server Logic

Scope:
- All four Express route handlers implemented and wired to `/api/v1`
- Gmail API integration: OAuth token exchange, message list, send, label modification
- JWT issuance and `Authorization: Bearer` middleware
- Full Jest test suite (unit + integration with mocked Gmail + mocked Supabase)

The Supabase schema SQL file **may be authored** during Session 1 but **must not be applied to any database** (dev, staging, or prod).

**Gate:** Run `npm test`. The command must exit 0 with no failures and no skips. Screenshot or CI log required as evidence.

### Session 2 — Schema Review

Unlocked only after the Session 1 gate is cleared.

Scope:
- PR opened containing only the Supabase migration SQL
- Migration reviewed for correctness, idempotency, and index coverage
- Schema applied to the database
- Integration tests re-run against the live Supabase instance

**No schema PR may be opened before `npm test` exits 0.**

---

## 3. Data Model: Message

The `messages` Supabase table stores one row per Gmail message per user. The TypeScript interface below maps every field to its Supabase column type and its source in the Gmail API response.

```typescript
interface Message {
  // ── Supabase-managed ──────────────────────────────────────────────────────
  id:         string;        // PRIMARY KEY — server-generated UUID (gen_random_uuid()).
                             //   Opaque row identifier. NOT equal to gmailId.
                             //   Use it as a stable client-side key only; it is NOT
                             //   the value the action endpoints accept in their path
                             //   (those key on gmailId — see the §4 path-id note).
  userId:     string;        // UUID NOT NULL REFERENCES users(id)
                             //   source: JWT `sub` claim on write
  createdAt:  string;        // TIMESTAMPTZ — Supabase default now()
  updatedAt:  string;        // TIMESTAMPTZ — Supabase default now(), updated by trigger

  // ── Gmail message root ────────────────────────────────────────────────────
  gmailId:    string;        // TEXT NOT NULL
                             //   source: message.id
                             //   This is the `:id` path param for PATCH /messages/:id
                             //   and every /drafts/:id endpoint. A draft's gmailId is
                             //   REASSIGNED by drafts.update / drafts.send — always use
                             //   the gmailId from the latest response for follow-up calls.
  threadId:   string;        // TEXT NOT NULL
                             //   source: message.threadId
  labelIds:   string[];      // TEXT[] NOT NULL DEFAULT '{}'
                             //   source: message.labelIds  e.g. ["INBOX","UNREAD","STARRED"]

  // ── Headers (message.payload.headers[], matched by `name`) ────────────────
  from:       string;        // TEXT NOT NULL
                             //   source: header where name = "From"
                             //   e.g. "Alice Example <alice@example.com>"
  to:         string;        // TEXT NOT NULL
                             //   source: header where name = "To"
  subject:    string;        // TEXT NOT NULL DEFAULT ''
                             //   source: header where name = "Subject"
  date:       string;        // TEXT NOT NULL
                             //   source: header where name = "Date"  (RFC 2822)

  // ── Content ───────────────────────────────────────────────────────────────
  snippet:    string;        // TEXT NOT NULL DEFAULT ''
                             //   source: message.snippet
                             //   ≤100 chars, HTML-entity-escaped, no tags
  bodyPlain:  string | null; // TEXT
                             //   source: first part where mimeType = "text/plain"
                             //   decoded from base64url (part.body.data)
  bodyHtml:   string | null; // TEXT
                             //   source: first part where mimeType = "text/html"
                             //   decoded from base64url (part.body.data)

  // ── Derived flags (computed from labelIds at write time) ──────────────────
  isRead:     boolean;       // BOOLEAN NOT NULL DEFAULT false
                             //   rule: !labelIds.includes("UNREAD")
  isStarred:  boolean;       // BOOLEAN NOT NULL DEFAULT false
                             //   rule: labelIds.includes("STARRED")

  // ── Status ────────────────────────────────────────────────────────────────
  status:     'inbox' | 'sent' | 'draft' | 'archived' | 'trash';
                             // TEXT NOT NULL DEFAULT 'inbox'
                             //   derived from labelIds at write time:
                             //   'draft'    → labelIds.includes("DRAFT")
                             //   'sent'     → labelIds.includes("SENT") && !DRAFT
                             //   'trash'    → labelIds.includes("TRASH")
                             //   'archived' → !INBOX && !SENT && !DRAFT && !TRASH
                             //   'inbox'    → default / labelIds.includes("INBOX")
  draftId:    string | null; // TEXT — Gmail draft ID (drafts.id from the drafts API)
                             //   null for all non-draft messages
                             //   required to call drafts.update / drafts.delete
                             //   cleared (set to null) when a draft is sent
}
```

### Gmail API fetch strategy

| Field group | Gmail API call | Response path |
|---|---|---|
| `gmailId`, `threadId`, `labelIds`, `snippet` | `messages.get(id, format=FULL)` | `message.{id,threadId,labelIds,snippet}` |
| `from`, `to`, `subject`, `date` | same call | `message.payload.headers[]` — find by `header.name` (case-insensitive) |
| `bodyPlain` | same call | `message.payload.parts[]` where `mimeType = "text/plain"`, then `part.body.data` → base64url decode |
| `bodyHtml` | same call | `message.payload.parts[]` where `mimeType = "text/html"`, then `part.body.data` → base64url decode |

For single-part messages (no `parts` array), fall back to `message.payload.body.data`.

---

## 4. Endpoint Contracts

All endpoints share:
- **Base URL:** `/api/v1`
- **Content-Type on all JSON responses:** `application/json`
- **Auth:** `Authorization: Bearer <jwt>` required on every endpoint except the OAuth callback
- **Path id (`:id`):** for `PATCH /messages/:id` and all `/drafts/:id*` endpoints, the `:id`
  segment is the **Gmail message id** (the `gmailId` field — a hex string such as
  `19eb1b4b228dec46`). It is **not** the Supabase row `id` (a server-generated UUID) and
  **not** the `draftId`. Handlers resolve the row by its `gmail_id` column and pass the same
  value to the Gmail API. `GET /threads/:threadId` uses the Gmail `threadId` (also from the
  message, not the row UUID).
- **Error envelope:** every non-2xx response returns exactly:

```typescript
{
  error: {
    code:     string;   // machine-readable, SCREAMING_SNAKE_CASE
    message:  string;   // human-readable description
    details?: unknown;  // optional structured context (validation errors, etc.)
  }
}
```

---

### 4.1 OAuth Callback — `GET /api/v1/auth/google/callback`

Receives the authorization code from Google, exchanges it for tokens, upserts the user in Supabase, issues a JWT, and redirects the browser to the frontend.

> **OAuth initiation requirements (applies to the handler that generates the Google consent URL):**
> - `generateAuthUrl` must be called with `access_type: 'offline'` — without this Google does not issue a refresh token and the session becomes unrecoverable once the access token expires.
> - Include `prompt: 'consent'` to force the consent screen even for returning users, ensuring a fresh refresh token is always returned.
> - Wire `oauth2Client.on('tokens', callback)` immediately after constructing the OAuth2 client. This event fires every time the client silently refreshes an access token; the callback must upsert the new access token to Supabase. Without this listener the stored token drifts and eventually all Gmail API calls fail.

#### Request

```
Method:  GET
Path:    /api/v1/auth/google/callback
Auth:    none (unauthenticated)

Query parameters:
  code   string   required   Authorization code from Google
  state  string   optional   Opaque CSRF token (if used during /auth/google initiation)

Google also sends on denial:
  error  string             "access_denied" when user clicks Deny
```

#### Response — 302 Found (success)

```
Location: ${FRONTEND_URL}/auth/callback?token=<jwt>

JWT payload (HS256, signed with JWT_SECRET env var):
{
  sub:   string   // Supabase users.id (UUID)
  email: string
  name:  string
  exp:   number   // Unix timestamp — 7 days from issuance
}
```

The JWT is delivered in the redirect query string so the SPA can extract it on load. The server does not set a cookie.

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `MISSING_CODE` | `code` query param is absent and no `error` param present |
| 400 | `OAUTH_DENIED` | Google returned `error=access_denied` (user clicked Deny) |
| 502 | `TOKEN_EXCHANGE_FAILED` | POST to `https://oauth2.googleapis.com/token` returned non-2xx |
| 503 | `GMAIL_UNAVAILABLE` | Network timeout (>10 s) reaching any Google API |

---

### 4.2 Message List — `GET /api/v1/messages`

Returns a page of messages stored in Supabase for the authenticated user. Uses Gmail's `pageToken` as the pagination cursor.

#### Request

```
Method:  GET
Path:    /api/v1/messages
Auth:    Authorization: Bearer <jwt>   required

Query parameters:
  cursor   string   optional   Gmail pageToken returned in a previous response
  limit    number   optional   Page size. Default: 20. Min: 1. Max: 100.
  labelId  string   optional   Gmail label ID to filter by (e.g. "INBOX", "SENT")
```

#### Response — 200 OK

```typescript
{
  messages:   Message[];      // ordered newest-first
  nextCursor: string | null;  // pass as `cursor` on the next request; null = no more pages
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 403 | `SCOPE_MISSING` | The stored Google access token lacks `gmail.modify` scope |
| 422 | `INVALID_LIMIT` | `limit` is present but is < 1, > 100, or not a number |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_LIST_FAILED` | Gmail API responded with any other non-2xx status |

---

### 4.3 Message Send — `POST /api/v1/messages`

Composes and sends an email via the Gmail API, then persists the sent message in Supabase. Supports both new composition and threaded replies.

#### Request

```
Method:       POST
Path:         /api/v1/messages
Auth:         Authorization: Bearer <jwt>   required
Content-Type: application/json

Body:
{
  to:        string    required   Recipient email address (RFC 5321)
  subject:   string    required   Email subject line
  body:      string    required   Message body — plain text or HTML
  threadId?: string    optional   Existing Gmail thread ID; include to reply in-thread
}
```

#### Response — 201 Created

```typescript
{
  message: Message   // the sent message as stored in Supabase
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `MISSING_FIELDS` | One or more of `to`, `subject`, `body` is absent or empty string |
| 400 | `INVALID_RECIPIENT` | `to` does not pass RFC 5321 email validation |
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `THREAD_NOT_FOUND` | `threadId` was provided but Gmail returned 404 for that thread |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_SEND_FAILED` | Gmail `messages.send` returned any other non-2xx status |

---

### 4.4 Mark as Read — `PATCH /api/v1/messages/:id`

Modifies the `UNREAD` label on the Gmail message and updates `isRead` in Supabase. Bidirectional: can mark read or unread in a single call.

#### Request

```
Method:       PATCH
Path:         /api/v1/messages/:id
Auth:         Authorization: Bearer <jwt>   required
Content-Type: application/json

Path parameters:
  id   string   required   Gmail messageId (the `gmailId` field, a hex string — NOT the Supabase row `id` UUID)

Body:
{
  read: boolean   required   true → remove UNREAD label; false → add UNREAD label
}
```

#### Response — 200 OK

```typescript
{
  message: {
    id:     string;
    isRead: boolean;
  }
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `INVALID_BODY` | `read` field is absent, null, or not a boolean |
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `MESSAGE_NOT_FOUND` | No message with `:id` exists for the authenticated user |
| 409 | `ALREADY_IN_STATE` | Message `isRead` already equals the requested `read` value |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_MODIFY_FAILED` | Gmail `messages.modify` returned any other non-2xx status |

---

---

### 4.5 Message Actions — `PATCH /api/v1/messages/:id` (extended)

Extends §4.4 to also support starring and archiving/trashing. All three actions (`read`, `starred`, `archived`, `trashed`) may be sent in the same request body; any combination is valid. The existing `read` behaviour is unchanged.

#### Request

```
Method:       PATCH
Path:         /api/v1/messages/:id
Auth:         Authorization: Bearer <jwt>   required
Content-Type: application/json

Body (all fields optional, at least one required):
{
  read?:     boolean   true → remove UNREAD label; false → add UNREAD label
  starred?:  boolean   true → add STARRED label;  false → remove STARRED label
  archived?: boolean   true → remove INBOX label (moves out of inbox, keeps in All Mail)
  trashed?:  boolean   true → add TRASH label;    false → remove TRASH label
}
```

#### Response — 200 OK

```typescript
{
  message: {
    id:         string;
    isRead:     boolean;
    isStarred:  boolean;
    status:     'inbox' | 'sent' | 'draft' | 'archived' | 'trash';
  }
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `INVALID_BODY` | Body is empty or contains no recognised boolean fields |
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `MESSAGE_NOT_FOUND` | No message with `:id` exists for the authenticated user |
| 409 | `ALREADY_IN_STATE` | All provided fields already match the requested values |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_MODIFY_FAILED` | Gmail `messages.modify` returned any other non-2xx status |

---

### 4.6 Thread View — `GET /api/v1/threads/:threadId`

Returns all messages in a Gmail thread for the authenticated user, ordered oldest-first. Messages are read from Supabase — only messages already synced are returned.

#### Request

```
Method:  GET
Path:    /api/v1/threads/:threadId
Auth:    Authorization: Bearer <jwt>   required

Path parameters:
  threadId   string   required   Gmail thread ID
```

#### Response — 200 OK

```typescript
{
  threadId:  string;
  messages:  Message[];   // ordered oldest-first (ascending date)
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `THREAD_NOT_FOUND` | No messages with `:threadId` exist for the authenticated user |
| 502 | `GMAIL_LIST_FAILED` | Supabase query failed |

---

### 4.7 Message Search — `GET /api/v1/messages/search`

Returns messages matching a search query. Searches `subject`, `from`, `snippet`, and `to` fields via case-insensitive substring match against the Supabase-persisted data. Uses the same cursor-based pagination as §4.2.

#### Request

```
Method:  GET
Path:    /api/v1/messages/search
Auth:    Authorization: Bearer <jwt>   required

Query parameters:
  q       string   required   Search string — matched against subject, from, snippet, to
  cursor  string   optional   Pagination cursor from a previous response
  limit   number   optional   Page size. Default: 20. Min: 1. Max: 100.
```

#### Response — 200 OK

```typescript
{
  messages:   Message[];
  nextCursor: string | null;
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `MISSING_QUERY` | `q` param is absent or empty string |
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 422 | `INVALID_LIMIT` | `limit` is present but is < 1, > 100, or not a number |

---

### 4.8 Draft Create — `POST /api/v1/drafts`

Creates a Gmail draft via the Gmail drafts API and persists it in Supabase with `status = 'draft'`. Supports both new drafts and draft replies (include `threadId` to attach to a thread).

#### Request

```
Method:       POST
Path:         /api/v1/drafts
Auth:         Authorization: Bearer <jwt>   required
Content-Type: application/json

Body:
{
  to:        string    required   Recipient email address (RFC 5321)
  subject:   string    required   Email subject line
  body:      string    required   Message body — plain text or HTML
  threadId?: string    optional   Existing Gmail thread ID for a draft reply
}
```

#### Response — 201 Created

```typescript
{
  message: Message   // status = 'draft', draftId populated
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `MISSING_FIELDS` | One or more of `to`, `subject`, `body` is absent or empty string |
| 400 | `INVALID_RECIPIENT` | `to` does not pass RFC 5321 email validation |
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_DRAFT_FAILED` | Gmail `drafts.create` returned any other non-2xx status |

---

### 4.9 Draft Update — `PATCH /api/v1/drafts/:id`

Updates the content of an existing Gmail draft. `:id` is the Gmail message id (the `gmailId` field — not the Supabase row `id` UUID, and not the `draftId`). The handler resolves the row by `gmail_id` and reads the stored `draftId` to call the Gmail drafts API. Note: `drafts.update` assigns a **new** Gmail message id, so the response carries the updated `gmailId` — subsequent calls (draft send/delete) must use that new value.

#### Request

```
Method:       PATCH
Path:         /api/v1/drafts/:id
Auth:         Authorization: Bearer <jwt>   required
Content-Type: application/json

Path parameters:
  id   string   required   Gmail messageId of the draft (the `gmailId` field — NOT the Supabase row `id` UUID, and NOT the draftId)

Body (all optional, at least one required):
{
  to?:      string
  subject?: string
  body?:    string
}
```

#### Response — 200 OK

```typescript
{
  message: Message   // updated draft; status = 'draft', draftId unchanged
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 400 | `INVALID_BODY` | Body is empty or contains no recognised fields |
| 400 | `INVALID_RECIPIENT` | `to` is present but does not pass RFC 5321 email validation |
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `DRAFT_NOT_FOUND` | No draft with `:id` exists for the authenticated user |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_DRAFT_FAILED` | Gmail `drafts.update` returned any other non-2xx status |

---

### 4.10 Draft Delete — `DELETE /api/v1/drafts/:id`

Deletes the Gmail draft and removes the Supabase row. Both operations must succeed — if the Gmail delete succeeds but the Supabase delete fails, the error is surfaced and the Supabase row is left for retry. `:id` is the Gmail message id (the `gmailId` field — not the Supabase row `id` UUID).

#### Request

```
Method:  DELETE
Path:    /api/v1/drafts/:id
Auth:    Authorization: Bearer <jwt>   required

Path parameters:
  id   string   required   Gmail messageId of the draft (the `gmailId` field — NOT the Supabase row `id` UUID, and NOT the draftId)
```

#### Response — 204 No Content

No body.

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `DRAFT_NOT_FOUND` | No draft with `:id` exists for the authenticated user |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_DRAFT_FAILED` | Gmail `drafts.delete` returned any other non-2xx status |

---

---

### 4.11 Draft Send — `POST /api/v1/drafts/:id/send`

Sends an existing Gmail draft via `drafts.send` and transitions the Supabase row: clears `draftId`, updates `gmailId` to the new sent message ID, and sets `status = 'sent'`. `:id` is the Gmail message id (the `gmailId` field — not the Supabase row `id` UUID).

#### Request

```
Method:  POST
Path:    /api/v1/drafts/:id/send
Auth:    Authorization: Bearer <jwt>   required

Path parameters:
  id   string   required   Gmail messageId of the draft (the `gmailId` field — NOT the Supabase row `id` UUID, and NOT the draftId)

Body: none required
```

#### Response — 200 OK

```typescript
{
  message: Message   // status = 'sent', draftId = null, gmailId updated to sent message ID
}
```

#### Typed error cases

| HTTP | `error.code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | JWT is missing, malformed, expired, or signature invalid |
| 404 | `DRAFT_NOT_FOUND` | No draft with `:id` exists for the authenticated user |
| 429 | `GMAIL_RATE_LIMITED` | Gmail API responded with HTTP 429 |
| 502 | `GMAIL_DRAFT_FAILED` | Gmail `drafts.send` returned any other non-2xx status |

---

*Last updated: 2026-06-11*

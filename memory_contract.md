# VibeMail Memory — Contract

## 1. What Gets Embedded?

The **base unit is the message**, but the **storage unit is a chunk**. The two differ because the embedding model can only read about 2000 characters at a time, so a message longer than that cannot be embedded as a single vector.

### Chunk shape

Every chunk is embedded with the sender and subject on their own lines, then a blank line, then the chunk text:

```
<sender>
<subject>

<chunk text>
```

The header is repeated on **every** chunk of a message, so no chunk is ever context-free — chunk 7 of a long thread still carries who wrote it and what it was about.

### Splitting

| Parameter | Value |
|---|---|
| Target chunk size | 1500 characters |
| Overlap between adjacent chunks | 200 characters |
| Composed chunk (header + slice) | Must stay ≤ 2000 characters |

Bodies are split into 1500-character chunks with 200 characters of overlap, so a sentence that spans a chunk boundary appears intact in at least one chunk and is not lost.

These are **character** counts, not token counts. We do not tokenize to measure chunk size. Splits must not cut a UTF-16 surrogate pair, and stored `chunk_text` must not contain NUL or unpaired surrogates (Postgres `json` rejects both).

### Model

| Property | Value |
|---|---|
| Model | GTE-small |
| Dimensions | 384 |
| Language | English only |
| Stored vectors | Unit-normalized; HNSW uses inner product (`vector_ip_ops`) |

GTE-small is the only embedding model this platform runs natively. Swapping it for another model later means self-hosting.

### Pipeline

The `/embed` edge function takes **one string** and returns **one 384-dimension vector**. It does not chunk mail, it does not write to the database, and it does not know which user a string belongs to.

The Node app owns the rest:

1. Split the message (rules above).
2. Call `/embed` once per chunk with **bounded concurrency** (3 in flight). Unbounded `Promise.all` over a long message trips the isolate's 2-second CPU limit (HTTP 546).
3. Retry transient embed failures (502 / 503 / 504 / 546).
4. Delete that message's existing `message_chunks` rows, then insert the new ones.

Every inserted row copies `user_id` from the **message owner** (`messages.user_id` / the JWT `sub`). It is never inferred from `auth.uid()`.

---

## 2. Chunks In, Messages Out

Search operates over chunks, but results are always collapsed to one row per message. A message's score is its best chunk (highest inner product against a unit-normalized query vector).

The user must never see chunk-level results.

---

## 3. How Retrieval Is Scoped

Three rules govern every retrieval.

### Ownership

Retrieval only ever returns the current user's mail. **This is enforced in application code and in SQL, by an explicit `user_id` argument — not by RLS.**

The server connects with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS entirely. Auth is a custom HS256 JWT, not Supabase Auth, so `auth.uid()` is never populated. A `match_messages` (or any other retrieval function) that omitted `user_id` and trusted `user_id = auth.uid()` would return **every user's mail** to whoever called it.

Therefore:

- Every retrieval function takes a `user_id` parameter and filters `WHERE user_id = p_user_id` inside the function.
- Every existing route already scopes the same way: `.eq('user_id', payload.sub)`. Retrieval callers pass `payload.sub`.
- Writes tag each chunk with that same owner id. Backfill copies `user_id` from the parent `messages` row — never guessed, never left null.

The RLS policy `message_chunks_own` (`user_id = auth.uid()`) stays as **defence-in-depth**, the same as `messages`. It is not the ownership check. Do not `FORCE` RLS; the service-role client must keep working.

### Recency

Between two messages of similar relevance, the more recent one ranks higher. This is a gentle down-weight on older matches, not a hard re-sort by date.

### Limits

Return at most **8 messages** after collapsing chunks, and discard anything below a similarity threshold.

Measured on a live mailbox (TEST_PLAN.md §5): on-topic questions scored about **−0.85 to −0.89** (`<#>` distance, lower is better); unrelated mail started around **−0.81**. Search keeps the floor at **−0.82**. Digest uses the same floor so an unmatched topic returns nothing, and a count of **12** (not 20) so extra slots do not just repeat the same sender.

---

## 4. When Embeddings Are Invalidated

| Event | Effect on chunks |
|---|---|
| Insert (sync, webhook, send, draft create) | Chunk and embed before the message can be retrieved |
| Edit to `subject` or `body` (including draft update) | Delete all of that message's chunks and rebuild from scratch |
| Unchanged subject **and** `body_plain` on upsert | None — skip re-embed |
| Delete | Chunks go with the message (`ON DELETE CASCADE`) |
| Label change | None |
| Read-status / star flip | None |

**On insert**, the message is chunked in the application, each chunk is embedded via `/embed`, and the vectors are written to `message_chunks` with that message's `user_id` before the message can be retrieved.

**On an edit** to the subject or body, delete all of that message's chunks and rebuild them from scratch. This is not an update in place, because the new body may split into a different number of chunks. Old `chunk_text` (and old chunk row ids) must be gone; sender and subject remain on every new chunk.

Draft create and draft update always rebuild. Sync and webhook upserts snapshot `subject` / `body_plain` **before** the write and skip ingest when both are unchanged.

**On delete**, the chunks go with the message in the same transaction via `message_chunks.message_id → messages.id ON DELETE CASCADE`.

**Label changes and read-status / star flips do not trigger re-embedding**, because they don't change what the message means. Chunk `id` and `created_at` must not move.

---

## 5. Degradation

### Cold start

Because VibeMail already holds the user's mail, day one is a **resumable local backfill** (`npm run embed:backfill`). It is a Node script, not an Edge Function or a Vercel Function — those cap wall-clock time per request.

The script selects messages that have no `message_chunks` rows and runs the same `ingestMessageChunks` helper as the live write path. Interrupt and re-run at any time: already-chunked messages are skipped. `user_id` on every chunk is copied from the parent message.

While the index is still thin, features fall back to keyword search — and never present a below-threshold match as a confident answer.

### Quota exhaustion

The reasoning provider runs on a free tier with rate limits, so **any feature that calls it must still work without it**.

When the provider is unavailable, show the retrieved results without a summary rather than showing an error.

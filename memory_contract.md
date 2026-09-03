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
| Target chunk size | ~1500 characters |
| Overlap between adjacent chunks | ~200 characters |

Bodies are split into roughly 1500-character chunks with about 200 characters of overlap, so a sentence that spans a chunk boundary appears intact in at least one chunk and is not lost.

These are **character** counts, not token counts. We do not tokenize to measure chunk size.

### Model

| Property | Value |
|---|---|
| Model | GTE-small |
| Dimensions | 384 |
| Language | English only |

GTE-small is the only embedding model this platform runs natively. Swapping it for another model later means self-hosting.

---

## 2. Chunks In, Messages Out

Search operates over chunks, but results are always collapsed to one row per message. A message's score is its best — that is, lowest-distance — chunk.

The user must never see chunk-level results.

---

## 3. How Retrieval Is Scoped

Three rules govern every retrieval.

### Ownership

Retrieval only ever returns the current user's mail. This is enforced by a row-level security policy on `user_id = auth.uid()`, **not** in application code.

### Recency

Between two messages of similar relevance, the more recent one ranks higher. This is a gentle down-weight on older matches, not a hard re-sort by date.

### Limits

Return at most **8 messages** after collapsing chunks, and discard anything below a similarity threshold.

Both the result count and the threshold are **starting values**, not settled numbers. The exact threshold is left to be set once we know how we're scoring similarity in the next lesson.

---

## 4. When Embeddings Are Invalidated

| Event | Effect on chunks |
|---|---|
| Insert | Chunk and embed the message before it can be retrieved |
| Edit to `subject` or `body` | Delete all of that message's chunks and rebuild from scratch |
| Delete | Chunks go with the message, in the same transaction |
| Label change | None |
| Read-status flip | None |

**On insert**, a message is chunked and embedded before it can be retrieved.

**On an edit** to the subject or body, delete all of that message's chunks and rebuild them from scratch. This is not an update in place, because the new body may split into a different number of chunks.

**On delete**, the chunks go with the message in the same transaction.

**Label changes and read-status flips do not trigger re-embedding**, because they don't change what the message means.

---

## 5. Degradation

### Cold start

Because VibeMail already holds the user's mail, day one is solved with a **resumable backfill** that chunks and embeds the entire existing inbox up front.

While the index is still thin, features fall back to keyword search — and never present a below-threshold match as a confident answer.

### Quota exhaustion

The reasoning provider runs on a free tier with rate limits, so **any feature that calls it must still work without it**.

When the provider is unavailable, show the retrieved results without a summary rather than showing an error.

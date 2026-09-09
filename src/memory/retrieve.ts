import { getClient } from '../db'
import { ProviderError } from '../types/provider'
import { rowToMessage, type DbMessageRow } from '../sync/normalize'
import type { Message } from '../types/message'
import { embedText } from './embedClient'

/**
 * MEMORY_CONTRACT.md §3 Limits — at most 8 messages after collapsing chunks.
 * Starting value; match_messages defaults to the same count.
 */
export const MATCH_COUNT = 8

/**
 * MEMORY_CONTRACT.md §3 starting similarity floor, as a `<#>` distance.
 * match_messages scores negative inner product (lower is better; a strong
 * match sits near -1). Anything worse than this is discarded.
 */
export const MATCH_THRESHOLD = -0.82

/**
 * Embed `query` with the same `/embed` path messages use, then retrieve the
 * signed-in user's nearest messages via `match_messages`. Ownership is passed
 * as `userId` (JWT `sub`) — never inferred from `auth.uid()`.
 */
export async function searchByMeaning(userId: string, query: string): Promise<Message[]> {
  const embedding = await embedText(query)
  return matchUserMessages(userId, embedding)
}

/**
 * Call `match_messages` for one user. The query vector is stringified the
 * same way ingest writes `message_chunks.embedding`.
 */
export async function matchUserMessages(
  userId: string,
  queryEmbedding: number[],
  matchCount: number = MATCH_COUNT,
): Promise<Message[]> {
  const { data, error } = await getClient().rpc('match_messages', {
    p_user_id: userId,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_match_threshold: MATCH_THRESHOLD,
    p_match_count: matchCount,
  })

  if (error) {
    throw new ProviderError('SEARCH_FAILED', error.message, error)
  }

  return (data ?? [])
    .filter((row) => row.user_id === userId)
    .map((row) => rowToMessage(matchRowToDbRow(row)))
}

function matchRowToDbRow(row: {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  gmail_id: string
  thread_id: string
  label_ids: string[]
  from_address: string
  to_address: string
  subject: string
  date: string
  snippet: string
  body_plain: string
  body_html: string
  is_read: boolean
  is_starred: boolean
  status: string
  draft_id: string
}): DbMessageRow {
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    gmail_id: row.gmail_id,
    thread_id: row.thread_id,
    label_ids: row.label_ids ?? [],
    from_address: row.from_address,
    to_address: row.to_address,
    subject: row.subject,
    date: row.date,
    snippet: row.snippet,
    body_plain: row.body_plain ?? null,
    body_html: row.body_html ?? null,
    is_read: row.is_read,
    is_starred: row.is_starred,
    status: row.status,
    draft_id: row.draft_id ?? null,
    attachments: null,
  }
}

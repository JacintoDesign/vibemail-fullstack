import { getClient } from '../db'
import { ProviderError } from '../types/provider'
import type { Message } from '../types/message'
import { MATCH_COUNT, matchUserMessages } from './retrieve'

/** Cap for the related rail — three or four neighboring stories. */
export const RELATED_COUNT = 4

/** Fetch extra so dropping the open message (and its thread) still leaves a full rail. */
const RELATED_FETCH = MATCH_COUNT + RELATED_COUNT

/**
 * Other messages about the same story as `gmailId`, ranked by the stored
 * embedding already on that row. Does not call /embed. Does not boost or
 * filter by sender. Drops the open message and the rest of its thread.
 * Weak hits never leave match_messages (MATCH_THRESHOLD).
 */
export async function relatedMessages(userId: string, gmailId: string): Promise<Message[]> {
  const { data: origin, error: originError } = await getClient()
    .from('messages')
    .select('id, thread_id, gmail_id, user_id')
    .eq('gmail_id', gmailId)
    .eq('user_id', userId)
    .maybeSingle()

  if (originError) {
    throw new ProviderError('SEARCH_FAILED', originError.message, originError)
  }
  if (!origin || origin.user_id !== userId) {
    throw new ProviderError('MESSAGE_NOT_FOUND', `No message with id "${gmailId}" found for this user`)
  }

  const { data: chunk, error: chunkError } = await getClient()
    .from('message_chunks')
    .select('embedding')
    .eq('message_id', origin.id)
    .eq('user_id', userId)
    .order('chunk_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (chunkError) {
    throw new ProviderError('SEARCH_FAILED', chunkError.message, chunkError)
  }

  const embedding = parseStoredEmbedding(chunk?.embedding)
  if (!embedding) return []

  const hits = await matchUserMessages(userId, embedding, RELATED_FETCH)
  return hits
    .filter(
      (m) =>
        m.id !== origin.id &&
        m.threadId !== origin.thread_id &&
        m.status !== 'trash',
    )
    .slice(0, RELATED_COUNT)
}

/** Rehydrate a unit vector stored on message_chunks.embedding. Never invents one. */
export function parseStoredEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    const nums = raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    return nums.length === 384 ? nums : null
  }
  if (typeof raw !== 'string' || raw.length < 2) return null
  const trimmed = raw.trim()
  try {
    return parseStoredEmbedding(JSON.parse(trimmed) as unknown)
  } catch {
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const nums = trimmed
        .slice(1, -1)
        .split(',')
        .map((part) => Number(part.trim()))
      if (nums.length === 384 && nums.every((n) => Number.isFinite(n))) return nums
    }
    return null
  }
}

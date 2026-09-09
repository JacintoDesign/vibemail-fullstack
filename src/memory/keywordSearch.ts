import { getClient } from '../db'
import { ProviderError } from '../types/provider'
import { rowToMessage, type DbMessageRow } from '../sync/normalize'
import type { Message } from '../types/message'

const STOP = new Set([
  'the',
  'and',
  'for',
  'any',
  'some',
  'about',
  'from',
  'with',
  'into',
  'that',
  'this',
  'what',
  'whats',
  'who',
  'whom',
  'whose',
  'where',
  'when',
  'why',
  'how',
  'did',
  'does',
  'doing',
  'are',
  'can',
  'could',
  'would',
  'should',
  'which',
  'was',
  'were',
  'will',
  'has',
  'have',
  'had',
  'anyone',
  'someone',
  'something',
  'mention',
  'mentioned',
  'latest',
  'show',
])

/**
 * Substring search over subject/from/snippet/to. Used when semantic retrieval
 * returns nothing that clears MATCH_THRESHOLD (MEMORY_CONTRACT.md §5).
 *
 * Tries the raw query first (same as GET /messages/search). If that misses —
 * typical for a full question — retries with content words so "what is terraform?"
 * can still hit a subject that contains "terraform".
 */
export async function searchByKeyword(
  userId: string,
  query: string,
  limit = 50,
): Promise<Message[]> {
  const term = query.trim()
  if (!term) return []

  const tokens = keywordTerms(term)
  return ilikeAny(userId, tokens.length > 0 ? tokens : [term], limit)
}

export function keywordTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

async function ilikeAny(userId: string, terms: string[], limit: number): Promise<Message[]> {
  const clauses = terms.flatMap((raw) => {
    const t = raw.replace(/[,()]/g, '')
    if (!t) return []
    const pat = `%${t}%`
    return [
      `subject.ilike.${pat}`,
      `from_address.ilike.${pat}`,
      `snippet.ilike.${pat}`,
      `to_address.ilike.${pat}`,
    ]
  })
  if (clauses.length === 0) return []

  const { data, error } = await getClient()
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .or(clauses.join(','))
    .order('created_at', { ascending: false })
    .order('gmail_id', { ascending: false })
    .limit(limit)

  if (error) {
    throw new ProviderError('SEARCH_FAILED', error.message, error)
  }

  return ((data ?? []) as DbMessageRow[]).map(rowToMessage)
}

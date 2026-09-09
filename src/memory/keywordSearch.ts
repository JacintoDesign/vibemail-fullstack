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

/**
 * Distinctive tokens for buried-chunk lookup. Hyphenated names (`e-certify`)
 * at 8+ characters, or plain tokens at 11+ (`certificates`, `photosynthesis`).
 * Short common words (`image`, `generation`) stay out so this cannot crowd
 * out semantic ranking.
 */
export function rareLexicalTerms(query: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of query.toLowerCase().split(/\s+/)) {
    const t = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').replace(/'/g, '')
    if (!t || STOP.has(t) || seen.has(t)) continue
    const rare = t.includes('-') ? t.length >= 8 : t.length >= 11
    if (!rare) continue
    seen.add(t)
    terms.push(t)
  }
  return terms
}

/**
 * Messages whose stored chunk_text contains a rare query token. Finds a fact
 * buried past the first 1500 characters when the vector floor ranks other
 * mail higher.
 */
export async function searchChunksByRareTerms(
  userId: string,
  query: string,
  limit = 8,
): Promise<Message[]> {
  const terms = rareLexicalTerms(query)
  if (terms.length === 0) return []

  const clauses = terms.flatMap((raw) => {
    const t = raw.replace(/[,()]/g, '')
    return t ? [`chunk_text.ilike.%${t}%`] : []
  })
  if (clauses.length === 0) return []

  const { data, error } = await getClient()
    .from('message_chunks')
    .select('message_id')
    .eq('user_id', userId)
    .or(clauses.join(','))
    .limit(limit * 4)

  if (error) {
    throw new ProviderError('SEARCH_FAILED', error.message, error)
  }

  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of data ?? []) {
    if (seen.has(row.message_id)) continue
    seen.add(row.message_id)
    ids.push(row.message_id)
    if (ids.length >= limit) break
  }
  if (ids.length === 0) return []

  const { data: messages, error: msgError } = await getClient()
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .in('id', ids)

  if (msgError) {
    throw new ProviderError('SEARCH_FAILED', msgError.message, msgError)
  }

  const byId = new Map(((messages ?? []) as DbMessageRow[]).map((row) => [row.id, row]))
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is DbMessageRow => row !== undefined)
    .filter((row) => row.status !== 'trash' && row.status !== 'draft')
    .map(rowToMessage)
}

/** Rare chunk hits first (buried exact terms), then vector hits. One row per message. */
export function mergeRetrieval(preferred: Message[], rest: Message[], cap: number): Message[] {
  const out: Message[] = []
  const seen = new Set<string>()
  for (const message of [...preferred, ...rest]) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    out.push(message)
    if (out.length >= cap) break
  }
  return out
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

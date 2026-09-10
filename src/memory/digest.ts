import { reason } from '../reason'
import type { Message } from '../types/message'
import type { ReasonContextMessage } from '../types/reason'
import { constrainCitedNames, newsletterName } from './citations'
import { searchByMeaning } from './retrieve'

export { newsletterName }

/**
 * Wider than search (`MATCH_COUNT` = 8). Digest is breadth — every matching
 * newsletter stays a source, including several that covered the same launch.
 * 12, not 20: on a real mailbox new senders stop appearing after ~5 and 20
 * just repeats the same Design issues (TEST_PLAN.md §5.5).
 */
export const DIGEST_COUNT = 12

/**
 * Same `<#>` floor as search. A looser digest floor (−0.75) admitted unrelated
 * mail around −0.80 and filled the empty path with 20 noise sources.
 */
export const DIGEST_THRESHOLD = -0.82

/** Short excerpt sent to the reasoner — not the whole newsletter. */
export const EXCERPT_CHARS = 500

const DIGEST_SYSTEM = [
  'Write a short brief on the topic using only the Context messages.',
  'Cover what has been said, where the sources agree, and any specific detail worth noting even if only one source mentioned it.',
  'Name the newsletter or sender each point came from.',
  'Cite each source inline as [n] Name using its Context number, e.g. [1] TLDR Design.',
  'Do not add a source list, chips, or extra links after the brief.',
  'Do not include email addresses, dates, or raw ids in citations.',
  'Write multiple short paragraphs. A little longer than a one-paragraph search answer, not an essay.',
  'If the brief is not in Context, say so. Do not guess.',
].join(' ')

export interface DigestBrief {
  /** Model brief, or a newsletter list when the provider could not run. */
  text: string | null
  /** True when the list was used because the provider hit quota / was unavailable. */
  unavailable: boolean
}

/**
 * Messages about `topic` across the signed-in user's archive. Wider than
 * search, not unique'd by sender, trash and drafts dropped. Weak hits never
 * leave match_messages.
 */
export async function messagesForDigest(userId: string, topic: string): Promise<Message[]> {
  const hits = await searchByMeaning(userId, topic, {
    matchCount: DIGEST_COUNT,
    matchThreshold: DIGEST_THRESHOLD,
  })
  return hits.filter((m) => m.status !== 'trash' && m.status !== 'draft')
}

/**
 * Ground a topic brief in the retrieved messages. Callers still show the
 * list (MEMORY_CONTRACT.md §5) when the provider is unavailable — the brief
 * then names every matching newsletter instead of calling it an error.
 */
export async function digestFromMessages(
  topic: string,
  messages: Message[],
): Promise<DigestBrief> {
  if (messages.length === 0) return { text: null, unavailable: false }

  try {
    const result = await reason({
      systemInstruction: DIGEST_SYSTEM,
      prompt: topic,
      context: messages.map(toExcerptContext),
    })
    if (!result.available) return { text: fallbackDigest(messages), unavailable: true }
    const text = result.text?.trim()
    if (!text) return { text: fallbackDigest(messages), unavailable: true }
    const grounded = constrainCitedNames(text, messages)
    return { text: grounded ? grounded : fallbackDigest(messages), unavailable: false }
  } catch {
    return { text: fallbackDigest(messages), unavailable: true }
  }
}

/** Clip a message to a short excerpt for the reasoner. */
export function excerptOf(message: Message): string {
  const raw = (message.bodyPlain?.trim() || message.snippet || '').replace(/\s+/g, ' ')
  if (raw.length <= EXCERPT_CHARS) return raw
  const cut = raw.slice(0, EXCERPT_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  const clipped = (lastSpace > EXCERPT_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
  return `${clipped}…`
}

/**
 * Fallback when the model cannot run: every matching newsletter, not collapsed
 * by sender. Three issues from three sources all appear.
 */
export function fallbackDigest(messages: Message[]): string {
  const lines = messages.map((m, i) => {
    const name = newsletterName(m.from)
    const subject = m.subject.trim() || '(no subject)'
    return `- [${i + 1}] ${name} — ${subject}`
  })
  return `Couldn't write a brief. Matching newsletters:\n\n${lines.join('\n')}`
}

function toExcerptContext(message: Message): ReasonContextMessage {
  return {
    id: message.id,
    from: message.from,
    subject: message.subject,
    date: message.date,
    snippet: message.snippet,
    bodyPlain: excerptOf(message),
  }
}

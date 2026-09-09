import { reason } from '../reason'
import type { Message } from '../types/message'
import type { ReasonContextMessage } from '../types/reason'

const SEARCH_SYSTEM = [
  'Answer the user using only the Context messages.',
  'Name the newsletters or senders you used.',
  'Cite each source inline as [n] Name using its Context number, e.g. [1] TLDR Design.',
  'Do not add a source list, chips, or extra links after the answer.',
  'Do not include email addresses, dates, or raw ids in citations.',
  'Use short paragraphs and bullet lists, with a blank line between bullets.',
  'If the answer is not in Context, say so. Do not guess.',
].join(' ')

export interface GroundedAnswer {
  /** Model text when a summary was produced; otherwise null. */
  text: string | null
  /** True when the provider reported quota/unavailability — list still shows. */
  unavailable: boolean
}

/**
 * Ground an answer in the retrieved messages. Callers still show the list
 * (MEMORY_CONTRACT.md §5) when the provider is unavailable or errors.
 */
export async function answerFromMessages(
  query: string,
  messages: Message[],
): Promise<GroundedAnswer> {
  if (messages.length === 0) return { text: null, unavailable: false }

  try {
    const result = await reason({
      systemInstruction: SEARCH_SYSTEM,
      prompt: query,
      context: messages.map(toContext),
    })
    if (!result.available) return { text: null, unavailable: true }
    const text = result.text?.trim()
    return { text: text ? text : null, unavailable: false }
  } catch {
    // Invalid keys, outages, and quota all look the same to the user: show
    // the list with the quiet note, never an error (MEMORY_CONTRACT.md §5).
    return { text: null, unavailable: true }
  }
}

function toContext(message: Message): ReasonContextMessage {
  return {
    id: message.id,
    from: message.from,
    subject: message.subject,
    date: message.date,
    snippet: message.snippet,
    bodyPlain: message.bodyPlain,
  }
}

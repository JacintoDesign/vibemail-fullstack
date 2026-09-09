/**
 * Split a message into embeddable chunks (memory_contract.md §1).
 *
 * Character counts, not tokens. Sender and subject sit on every slice so
 * no chunk is context-free.
 */

export const CHUNK_SIZE = 1500
export const CHUNK_OVERLAP = 200
/** gte-small silently truncates at 512 tokens (~2000 characters). Fail instead. */
export const MODEL_INPUT_LIMIT_CHARS = 2000

export interface TextChunk {
  index: number
  text: string
}

export function chunkMessage(sender: string, subject: string, body: string): TextChunk[] {
  return splitBody(body).map((slice, index) => {
    const text = composeChunk(sender, subject, slice)
    assertWithinModelLimit(text, index)
    return { index, text }
  })
}

export function splitBody(body: string): string[] {
  if (body.length <= CHUNK_SIZE) return [body]

  const slices: string[] = []
  let start = 0
  while (start < body.length) {
    const end = snapSplitIndex(body, Math.min(start + CHUNK_SIZE, body.length))
    if (end <= start) {
      slices.push(body.slice(start, start + 1))
      start += 1
      continue
    }
    slices.push(body.slice(start, end))
    if (end >= body.length) break
    start = snapSplitIndex(body, end - CHUNK_OVERLAP)
  }
  return slices
}

/** Do not split a UTF-16 surrogate pair — Postgres json rejects a lone surrogate. */
function snapSplitIndex(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index
  const code = text.charCodeAt(index - 1)
  if (code >= 0xd800 && code <= 0xdbff) return index - 1
  return index
}

export function composeChunk(sender: string, subject: string, bodySlice: string): string {
  return sanitizeChunkText(`${sender}\n${subject}\n\n${bodySlice}`)
}

/** Postgres json (PostgREST inserts) rejects NUL and unpaired surrogates. */
export function sanitizeChunkText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
}

export function assertWithinModelLimit(composed: string, index: number): void {
  if (composed.length > MODEL_INPUT_LIMIT_CHARS) {
    throw new Error(
      `Chunk ${index} exceeds model input limit: ${composed.length} characters > ${MODEL_INPUT_LIMIT_CHARS}. ` +
        'gte-small would truncate this silently at 512 tokens.',
    )
  }
}

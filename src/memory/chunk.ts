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
    const end = Math.min(start + CHUNK_SIZE, body.length)
    slices.push(body.slice(start, end))
    if (end >= body.length) break
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return slices
}

export function composeChunk(sender: string, subject: string, bodySlice: string): string {
  return `${sender}\n${subject}\n\n${bodySlice}`
}

export function assertWithinModelLimit(composed: string, index: number): void {
  if (composed.length > MODEL_INPUT_LIMIT_CHARS) {
    throw new Error(
      `Chunk ${index} exceeds model input limit: ${composed.length} characters > ${MODEL_INPUT_LIMIT_CHARS}. ` +
        'gte-small would truncate this silently at 512 tokens.',
    )
  }
}

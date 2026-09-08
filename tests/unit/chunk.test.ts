import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  MODEL_INPUT_LIMIT_CHARS,
  assertWithinModelLimit,
  chunkMessage,
  composeChunk,
  splitBody,
} from '../../src/memory/chunk'

describe('splitBody', () => {
  it('returns a single slice when the body fits in one chunk', () => {
    expect(splitBody('short')).toEqual(['short'])
  })

  it('returns one empty slice for an empty body so the header is still embedded', () => {
    expect(splitBody('')).toEqual([''])
  })

  it('splits on character boundaries with overlap', () => {
    const body = 'a'.repeat(CHUNK_SIZE + 50)
    const slices = splitBody(body)
    expect(slices).toHaveLength(2)
    expect(slices[0]).toHaveLength(CHUNK_SIZE)
    expect(slices[1]).toBe(body.slice(CHUNK_SIZE - CHUNK_OVERLAP))
  })
})

describe('composeChunk', () => {
  it('puts sender and subject above a blank line and the body slice', () => {
    expect(composeChunk('Ada <ada@example.com>', 'Hello', 'body text')).toBe(
      'Ada <ada@example.com>\nHello\n\nbody text',
    )
  })
})

describe('assertWithinModelLimit', () => {
  it('throws when a composed chunk would be silently truncated', () => {
    expect(() => assertWithinModelLimit('x'.repeat(MODEL_INPUT_LIMIT_CHARS + 1), 0)).toThrow(
      /exceeds model input limit/,
    )
  })
})

describe('chunkMessage', () => {
  it('repeats sender and subject on every chunk', () => {
    const body = 'n'.repeat(CHUNK_SIZE + 10)
    const chunks = chunkMessage('Ann', 'Subject', body)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.startsWith('Ann\nSubject\n\n')).toBe(true)
    }
  })
})

import { parseStoredEmbedding } from '../../src/memory/related'

function vec(fill: number, axis?: number): number[] {
  const v = Array.from({ length: 384 }, () => fill)
  if (axis !== undefined) v[axis] = 1
  return v
}

describe('parseStoredEmbedding', () => {
  it('accepts a 384-d number array', () => {
    const v = vec(0, 0)
    expect(parseStoredEmbedding(v)).toEqual(v)
  })

  it('accepts a JSON array string', () => {
    const v = vec(0, 1)
    expect(parseStoredEmbedding(JSON.stringify(v))).toEqual(v)
  })

  it('accepts a pgvector-style brace string', () => {
    const v = vec(0, 2)
    const raw = `{${v.join(',')}}`
    expect(parseStoredEmbedding(raw)).toEqual(v)
  })

  it('returns null for the wrong length', () => {
    expect(parseStoredEmbedding([1, 2, 3])).toBeNull()
    expect(parseStoredEmbedding(JSON.stringify([1, 2, 3]))).toBeNull()
  })

  it('returns null for missing or garbage values', () => {
    expect(parseStoredEmbedding(null)).toBeNull()
    expect(parseStoredEmbedding(undefined)).toBeNull()
    expect(parseStoredEmbedding('')).toBeNull()
    expect(parseStoredEmbedding('not-a-vector')).toBeNull()
    expect(parseStoredEmbedding(12)).toBeNull()
  })
})

import { needsReasoning } from '../../src/memory/needsReasoning'

describe('needsReasoning', () => {
  it('is false for keyword lookups', () => {
    expect(needsReasoning('invoice')).toBe(false)
    expect(needsReasoning('compiler notes')).toBe(false)
    expect(needsReasoning('image tools')).toBe(false)
    expect(needsReasoning('Hopper')).toBe(false)
    expect(needsReasoning('email from hopper')).toBe(false)
  })

  it('is true for questions', () => {
    expect(needsReasoning("what's the latest on agent frameworks")).toBe(true)
    expect(needsReasoning('did any newsletter mention rate limits?')).toBe(true)
    expect(needsReasoning('Did any newsletter mention rate limits for the new agent framework?')).toBe(true)
    expect(needsReasoning('how do I reset my API key')).toBe(true)
  })

  it('is true for free-text prompts that are not a keyword bag', () => {
    expect(needsReasoning('tools that draw a picture from text')).toBe(true)
    expect(needsReasoning('show me the latest on agent frameworks')).toBe(true)
  })

  it('is false for empty / whitespace', () => {
    expect(needsReasoning('')).toBe(false)
    expect(needsReasoning('   ')).toBe(false)
  })
})

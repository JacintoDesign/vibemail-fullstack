jest.mock('../../src/reason', () => ({
  reason: jest.fn(),
}))

import {
  DIGEST_COUNT,
  EXCERPT_CHARS,
  digestFromMessages,
  excerptOf,
  fallbackDigest,
  newsletterName,
} from '../../src/memory/digest'
import { MATCH_COUNT } from '../../src/memory/retrieve'
import * as reasonMod from '../../src/reason'
import type { Message } from '../../src/types/message'

const reason = jest.mocked(reasonMod.reason)

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'row-1',
    userId: 'user-1',
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
    gmailId: 'g1',
    threadId: 't1',
    labelIds: ['INBOX'],
    internalDate: '0',
    from: 'Build Log <news@buildlog.example>',
    to: 'you@example.com',
    subject: 'Agent frameworks roundup',
    date: 'Wed, 09 Sep 2026 12:00:00 -0400',
    snippet: 'Rate limits for the new agent framework.',
    bodyPlain: 'Paragraph four: the new agent framework rate-limits at 60 rpm.',
    bodyHtml: null,
    isRead: true,
    isStarred: false,
    status: 'inbox',
    draftId: null,
    attachments: [],
    ...overrides,
  }
}

describe('digest helpers', () => {
  it('casts a wider net than search', () => {
    expect(DIGEST_COUNT).toBeGreaterThan(MATCH_COUNT)
  })

  it('clips a long body to a short excerpt and keeps short bodies intact', () => {
    const long = 'word '.repeat(200).trim()
    expect(long.length).toBeGreaterThan(EXCERPT_CHARS)
    const clipped = excerptOf(msg({ bodyPlain: long }))
    expect(clipped.endsWith('…')).toBe(true)
    expect(clipped.length).toBeLessThan(long.length)
    expect(clipped.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1)

    expect(excerptOf(msg({ bodyPlain: 'Short.' }))).toBe('Short.')
    expect(excerptOf(msg({ bodyPlain: '   ', snippet: 'From the snippet.' }))).toBe('From the snippet.')
  })

  it('reads the newsletter name from the From header', () => {
    expect(newsletterName('TLDR Design <dan@tldr.tech>')).toBe('TLDR Design')
    expect(newsletterName('news@buildlog.example')).toBe('news')
  })

  it('lists every matching newsletter, including several from the same sender', () => {
    const listed = fallbackDigest([
      msg({ from: 'TLDR <a@tldr.example>', subject: 'Launch one' }),
      msg({ from: 'The Verge <b@verge.example>', subject: 'Launch two' }),
      msg({ from: 'TLDR <a@tldr.example>', subject: 'Launch follow-up' }),
    ])
    expect(listed).toMatch(/TLDR — Launch one/)
    expect(listed).toMatch(/The Verge — Launch two/)
    expect(listed).toMatch(/TLDR — Launch follow-up/)
    expect(listed).toMatch(/Matching newsletters/)
  })
})

describe('digestFromMessages', () => {
  beforeEach(() => {
    reason.mockReset()
  })

  it('does not call reason when there are no messages', async () => {
    await expect(digestFromMessages('image tools', [])).resolves.toEqual({
      text: null,
      unavailable: false,
    })
    expect(reason).not.toHaveBeenCalled()
  })

  it('sends excerpts, not full bodies, and asks for a multi-source brief', async () => {
    reason.mockResolvedValue({ text: 'Build Log and TLDR both covered the launch.', available: true })
    const long = 'x'.repeat(EXCERPT_CHARS + 80)
    const retrieved = msg({ bodyPlain: long })

    await expect(digestFromMessages('the launch', [retrieved])).resolves.toEqual({
      text: 'Build Log and TLDR both covered the launch.',
      unavailable: false,
    })

    expect(reason).toHaveBeenCalledTimes(1)
    const args = reason.mock.calls[0]?.[0]
    expect(args?.prompt).toBe('the launch')
    expect(args?.systemInstruction).toMatch(/agree/i)
    expect(args?.systemInstruction).toMatch(/newsletter/i)
    expect(args?.systemInstruction).toMatch(/multiple short paragraphs/i)
    expect(args?.systemInstruction).toMatch(/only the Context/i)
    expect(args?.context).toHaveLength(1)
    expect(args?.context[0]?.bodyPlain).toBe(excerptOf(retrieved))
    expect(args?.context[0]?.bodyPlain?.length).toBeLessThan(long.length)
    expect(args?.context[0]?.from).toBe(retrieved.from)
  })

  it('lists matching newsletters when the provider reports quota exhaustion', async () => {
    reason.mockResolvedValue({ text: null, available: false })
    const a = msg({ from: 'TLDR <a@tldr.example>', subject: 'Same launch' })
    const b = msg({ id: 'row-2', from: 'The Verge <b@verge.example>', subject: 'Same launch' })
    const c = msg({ id: 'row-3', from: 'Stratechery <c@stratechery.example>', subject: 'Same launch' })

    const result = await digestFromMessages('the launch', [a, b, c])
    expect(result.unavailable).toBe(true)
    expect(result.text).toMatch(/TLDR/)
    expect(result.text).toMatch(/The Verge/)
    expect(result.text).toMatch(/Stratechery/)
  })

  it('lists matching newsletters when the provider throws', async () => {
    reason.mockRejectedValue(new Error('down'))
    const result = await digestFromMessages('the launch', [msg()])
    expect(result.unavailable).toBe(true)
    expect(result.text).toMatch(/Build Log/)
    expect(result.text).toMatch(/Agent frameworks roundup/)
  })
})

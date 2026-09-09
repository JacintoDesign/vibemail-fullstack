jest.mock('../../src/reason', () => ({
  reason: jest.fn(),
}))

import { answerFromMessages } from '../../src/memory/answerFromMessages'
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

describe('answerFromMessages', () => {
  beforeEach(() => {
    reason.mockReset()
  })

  it('does not call reason when there are no messages', async () => {
    await expect(answerFromMessages('what happened?', [])).resolves.toEqual({
      text: null,
      unavailable: false,
    })
    expect(reason).not.toHaveBeenCalled()
  })

  it('passes only retrieved messages and asks to name newsletters', async () => {
    reason.mockResolvedValue({ text: 'Build Log said 60 rpm.', available: true })
    const retrieved = msg()

    await expect(answerFromMessages('did any newsletter mention rate limits?', [retrieved])).resolves.toEqual({
      text: 'Build Log said 60 rpm.',
      unavailable: false,
    })

    expect(reason).toHaveBeenCalledTimes(1)
    const args = reason.mock.calls[0]?.[0]
    expect(args?.prompt).toBe('did any newsletter mention rate limits?')
    expect(args?.systemInstruction).toMatch(/newsletter/i)
    expect(args?.systemInstruction).toMatch(/\[n\]/)
    expect(args?.systemInstruction).toMatch(/not in Context/i)
    expect(args?.context).toEqual([
      {
        id: retrieved.id,
        from: retrieved.from,
        subject: retrieved.subject,
        date: retrieved.date,
        snippet: retrieved.snippet,
        bodyPlain: retrieved.bodyPlain,
      },
    ])
  })

  it('marks unavailable when the provider reports quota exhaustion', async () => {
    reason.mockResolvedValue({ text: null, available: false })
    await expect(answerFromMessages('what happened?', [msg()])).resolves.toEqual({
      text: null,
      unavailable: true,
    })
  })

  it('returns no text and marks unavailable when the provider throws', async () => {
    reason.mockRejectedValue(new Error('down'))
    await expect(answerFromMessages('what happened?', [msg()])).resolves.toEqual({
      text: null,
      unavailable: true,
    })
  })
})

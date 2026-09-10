import { constrainCitedNames, newsletterName } from '../../src/memory/citations'
import type { Message } from '../../src/types/message'

function msg(from: string, id = 'row-1'): Message {
  return {
    id,
    userId: 'user-1',
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
    gmailId: 'g1',
    threadId: 't1',
    labelIds: ['INBOX'],
    internalDate: '0',
    from,
    to: 'you@example.com',
    subject: 'Subject',
    date: 'Wed, 09 Sep 2026 12:00:00 -0400',
    snippet: 'snippet',
    bodyPlain: 'body',
    bodyHtml: null,
    isRead: true,
    isStarred: false,
    status: 'inbox',
    draftId: null,
    attachments: [],
  }
}

describe('constrainCitedNames', () => {
  const retrieved = [
    msg('TLDR Design <dan@tldr.tech>'),
    msg('The Verge <tips@verge.example>', 'row-2'),
  ]

  it('rewrites [n] Name to the retrieved sender for that index', () => {
    expect(constrainCitedNames('Faster models [1] Wired, and robots [2] Wired.', retrieved)).toBe(
      'Faster models [1] TLDR Design, and robots [2] The Verge.',
    )
  })

  it('rewrites [n, Name] labels to the retrieved sender', () => {
    expect(constrainCitedNames('Ranked No. 2 [1, Wired].', retrieved)).toBe(
      'Ranked No. 2 [1, TLDR Design].',
    )
  })

  it('drops citations whose index is not in the retrieved set', () => {
    const text = constrainCitedNames('TLDR agrees [1] TLDR Design, unlike [9] Stratechery.', retrieved)
    expect(text).toContain('[1] TLDR Design')
    expect(text).not.toMatch(/Stratechery/)
    expect(text).not.toMatch(/\[9\]/)
  })
})

describe('newsletterName', () => {
  it('reads the display name from an RFC 2822 From header', () => {
    expect(newsletterName('TLDR Design <dan@tldr.tech>')).toBe('TLDR Design')
    expect(newsletterName('news@buildlog.example')).toBe('news')
  })
})

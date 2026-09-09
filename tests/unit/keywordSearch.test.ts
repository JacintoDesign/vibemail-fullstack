import { keywordTerms, mergeRetrieval, rareLexicalTerms } from '../../src/memory/keywordSearch'
import type { Message } from '../../src/types/message'

describe('keywordTerms', () => {
  it('keeps content words from a question', () => {
    expect(keywordTerms('what is terraform?')).toEqual(['terraform'])
  })

  it('drops short and function words', () => {
    expect(keywordTerms('did anyone mention xylophones?')).toEqual(['xylophones'])
  })
})

describe('rareLexicalTerms', () => {
  it('keeps hyphenated names and long tokens, drops short common words', () => {
    expect(rareLexicalTerms('did a newsletter mention E-Certify root certificates?')).toEqual([
      'e-certify',
      'certificates',
    ])
    expect(rareLexicalTerms('tools that draw a picture from text')).toEqual([])
    expect(rareLexicalTerms('xylophone photosynthesis')).toEqual(['photosynthesis'])
  })
})

describe('mergeRetrieval', () => {
  function stub(id: string): Message {
    return {
      id,
      userId: 'u',
      createdAt: '',
      updatedAt: '',
      gmailId: id,
      threadId: id,
      labelIds: [],
      internalDate: '0',
      from: '',
      to: '',
      subject: id,
      date: '',
      snippet: '',
      bodyPlain: null,
      bodyHtml: null,
      isRead: true,
      isStarred: false,
      status: 'inbox',
      draftId: null,
      attachments: [],
    }
  }

  it('puts preferred hits first and never duplicates', () => {
    const a = stub('a')
    const b = stub('b')
    const c = stub('c')
    expect(mergeRetrieval([a], [b, a, c], 3).map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(mergeRetrieval([a, b], [c], 2).map((m) => m.id)).toEqual(['a', 'b'])
  })
})

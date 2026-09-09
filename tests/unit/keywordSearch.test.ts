import { keywordTerms } from '../../src/memory/keywordSearch'

describe('keywordTerms', () => {
  it('keeps content words from a question', () => {
    expect(keywordTerms('what is terraform?')).toEqual(['terraform'])
  })

  it('drops short and function words', () => {
    expect(keywordTerms('did anyone mention xylophones?')).toEqual(['xylophones'])
  })
})

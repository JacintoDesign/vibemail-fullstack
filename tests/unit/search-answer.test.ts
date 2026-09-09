import { citedIndices, mentionedIndices, parseAnswer } from '../../app/lib/search-answer'

describe('parseAnswer', () => {
  it('turns [n] and Newsletter [n] parentheticals into citations', () => {
    const blocks = parseAnswer(
      'Microsoft leads. (Newsletter [1], *TLDR Design <dan@tldrnewsletter.com>*, June 11, 2026)\n\nAlso [2] Build Log.',
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({
      type: 'p',
      parts: [
        { type: 'text', text: 'Microsoft leads. ' },
        { type: 'cite', index: 1 },
      ],
    })
    expect(blocks[1]).toEqual({
      type: 'p',
      parts: [
        { type: 'text', text: 'Also ' },
        { type: 'cite', index: 2 },
        { type: 'text', text: ' Build Log.' },
      ],
    })
    expect(citedIndices(blocks)).toEqual([1, 2])
  })

  it('turns [n, Name] into a labeled citation', () => {
    const blocks = parseAnswer(
      "Microsoft's MAI-Image-2.5 ranked No. 2 [1, TLDR Design].",
    )
    expect(blocks[0]).toEqual({
      type: 'p',
      parts: [
        { type: 'text', text: "Microsoft's MAI-Image-2.5 ranked No. 2 " },
        { type: 'cite', index: 1, label: 'TLDR Design' },
        { type: 'text', text: '.' },
      ],
    })
  })

  it('parses bullets, blank lines, and bold', () => {
    const blocks = parseAnswer(
      '**Microsoft MAI-Image-2.5:** a new model\n\n- First point [1]\n\n- Second point [2]',
    )
    expect(blocks[0]).toEqual({
      type: 'p',
      parts: [
        { type: 'bold', text: 'Microsoft MAI-Image-2.5:' },
        { type: 'text', text: ' a new model' },
      ],
    })
    expect(blocks[1]?.type).toBe('list')
    if (blocks[1]?.type !== 'list') return
    expect(blocks[1].items).toHaveLength(2)
    expect(blocks[1].items[0]).toEqual([
      { type: 'text', text: 'First point ' },
      { type: 'cite', index: 1 },
    ])
  })
})

describe('mentionedIndices', () => {
  it('finds sender names in the raw answer', () => {
    expect(mentionedIndices('TLDR Design covered Muse.', ['TLDR Design', 'Build Log'])).toEqual([1])
  })
})

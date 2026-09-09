/**
 * Unit tests for src/memory/ingest.ts
 *
 * embedText is mocked — this tests chunking, parallel fan-out, delete-then-insert,
 * user_id tagging, and skip-on-unchanged. Supabase writes are live.
 */

import { CHUNK_SIZE } from '../../src/memory/chunk'
import { ingestChangedMessages, ingestMessageChunks } from '../../src/memory/ingest'
import * as embedClient from '../../src/memory/embedClient'
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase'
import type { Message } from '../../src/types/message'

jest.mock('../../src/memory/embedClient', () => ({
  embedText: jest.fn(async () => Array.from({ length: 384 }, () => 0)),
}))

const embedText = jest.mocked(embedClient.embedText)

function fakeEmbedding(fill: number): number[] {
  return Array.from({ length: 384 }, () => fill)
}

let userId: string

beforeAll(async () => {
  const user = await seedUser()
  userId = user.id
})

afterAll(async () => {
  await cleanupUser(userId)
})

beforeEach(() => {
  embedText.mockClear()
  embedText.mockImplementation(async () => fakeEmbedding(0))
})

async function chunksFor(messageId: string): Promise<Array<{
  user_id: string
  chunk_index: number
  chunk_text: string
}>> {
  const { data, error } = await getTestClient()
    .from('message_chunks')
    .select('user_id, chunk_index, chunk_text')
    .eq('message_id', messageId)
    .order('chunk_index', { ascending: true })

  if (error) throw new Error(`message_chunks select failed: ${error.message}`)
  return data ?? []
}

function asUpsert(partial: {
  gmailId: string
  from: string
  subject: string
  bodyPlain: string
}): Omit<Message, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    userId,
    gmailId:      partial.gmailId,
    threadId:     'thread_ingest',
    labelIds:     ['INBOX'],
    internalDate: '0',
    from:         partial.from,
    to:           'to@example.com',
    subject:      partial.subject,
    date:         new Date().toUTCString(),
    snippet:      '',
    bodyPlain:    partial.bodyPlain,
    bodyHtml:     null,
    isRead:       false,
    isStarred:    false,
    status:       'inbox',
    draftId:      null,
    attachments:  [],
  }
}

describe('ingestMessageChunks', () => {
  it('splits the body, embeds every chunk in parallel, and stores user_id on each row', async () => {
    const msg = await seedMessage(userId, { subject: 'Hello' })
    const body = 'n'.repeat(CHUNK_SIZE + 10)
    const calls: string[] = []

    embedText.mockImplementation(async (text: string) => {
      calls.push(text)
      return fakeEmbedding(calls.length)
    })

    await ingestMessageChunks({
      messageId: msg.id,
      userId,
      sender:    'Ada <ada@example.com>',
      subject:   'Hello',
      body,
    })

    expect(calls.length).toBeGreaterThan(1)
    expect(embedText).toHaveBeenCalledTimes(calls.length)
    for (const text of calls) {
      expect(text.startsWith('Ada <ada@example.com>\nHello\n\n')).toBe(true)
    }

    const rows = await chunksFor(msg.id)
    expect(rows).toHaveLength(calls.length)
    for (const [i, row] of rows.entries()) {
      expect(row.user_id).toBe(userId)
      expect(row.chunk_index).toBe(i)
      expect(row.chunk_text).toBe(calls[i])
    }
  })

  it('deletes existing chunks for the message before inserting the new set', async () => {
    const msg = await seedMessage(userId, { subject: 'Draft' })

    await ingestMessageChunks({
      messageId: msg.id,
      userId,
      sender:    'Ann',
      subject:   'Draft',
      body:      'first version that is long enough to stay one chunk',
    })
    expect(await chunksFor(msg.id)).toHaveLength(1)

    await ingestMessageChunks({
      messageId: msg.id,
      userId,
      sender:    'Ann',
      subject:   'Draft',
      body:      'second',
    })

    const rows = await chunksFor(msg.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.chunk_text).toContain('second')
    expect(rows[0]?.chunk_text).not.toContain('first version')
    expect(rows[0]?.user_id).toBe(userId)
  })

  it('stores chunks when an emoji sits on a 1500-character boundary', async () => {
    const msg = await seedMessage(userId, { subject: 'Emoji' })
    const body = 'a'.repeat(CHUNK_SIZE - 1) + '😀' + 'z'.repeat(50)

    await ingestMessageChunks({
      messageId: msg.id,
      userId,
      sender:  'Ann',
      subject: 'Emoji',
      body,
    })

    const rows = await chunksFor(msg.id)
    expect(rows.length).toBeGreaterThan(1)
  })
})

describe('ingestChangedMessages', () => {
  it('skips re-embed when subject and body are unchanged', async () => {
    const msg = await seedMessage(userId, { subject: 'Same' })
    const body = 'unchanged body'

    await ingestMessageChunks({
      messageId: msg.id,
      userId,
      sender:    'sender@example.com',
      subject:   'Same',
      body,
    })
    embedText.mockClear()

    await ingestChangedMessages(
      [asUpsert({ gmailId: msg.gmail_id, from: 'sender@example.com', subject: 'Same', bodyPlain: body })],
      new Map([
        [msg.gmail_id, { id: msg.id, gmailId: msg.gmail_id, subject: 'Same', bodyPlain: body }],
      ]),
    )

    expect(embedText).not.toHaveBeenCalled()
    expect(await chunksFor(msg.id)).toHaveLength(1)
  })

  it('rebuilds chunks when the subject changes', async () => {
    const msg = await seedMessage(userId, { subject: 'Old subject' })

    await ingestMessageChunks({
      messageId: msg.id,
      userId,
      sender:    'sender@example.com',
      subject:   'Old subject',
      body:      'Hello world',
    })
    embedText.mockClear()

    await ingestChangedMessages(
      [asUpsert({ gmailId: msg.gmail_id, from: 'sender@example.com', subject: 'New subject', bodyPlain: 'Hello world' })],
      new Map([
        [msg.gmail_id, { id: msg.id, gmailId: msg.gmail_id, subject: 'Old subject', bodyPlain: 'Hello world' }],
      ]),
    )

    expect(embedText).toHaveBeenCalledTimes(1)
    const rows = await chunksFor(msg.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.chunk_text).toContain('New subject')
    expect(rows[0]?.chunk_text).not.toContain('Old subject')
  })
})

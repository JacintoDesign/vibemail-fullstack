/**
 * Integration tests for GET /api/v1/messages/digest
 *
 * embedText and reason are mocked so tests don't hit the live edge function
 * or the reasoning provider. Chunks are seeded with a known unit vector;
 * match_messages runs against live Supabase.
 */

import handler from '../../src/routes/messages/digest'
import * as embedClient from '../../src/memory/embedClient'
import * as reasonMod from '../../src/reason'
import { DIGEST_COUNT, EXCERPT_CHARS } from '../../src/memory/digest'
import { MATCH_COUNT } from '../../src/memory/retrieve'
import { signJwt } from '../../src/middleware/jwt'
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase'
import { mockReq, mockRes } from '../helpers/request'
import type { Message } from '../../src/types/message'

jest.mock('../../src/memory/embedClient', () => ({
  embedText: jest.fn(),
}))

jest.mock('../../src/reason', () => ({
  reason: jest.fn(),
}))

const embedText = jest.mocked(embedClient.embedText)
const reason = jest.mocked(reasonMod.reason)

function unitEmbedding(axis: number): number[] {
  const v = Array.from({ length: 384 }, () => 0)
  v[axis] = 1
  return v
}

const QUERY_VECTOR = unitEmbedding(0)
const OTHER_VECTOR = unitEmbedding(1)

let testUserId: string
let authHeader: string
const launchGmailIds: string[] = []

beforeAll(async () => {
  const user = await seedUser()
  testUserId = user.id
  authHeader = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`

  const newsletters = [
    { from: 'TLDR <news@tldr.example>', subject: 'The launch' },
    { from: 'The Verge <tips@verge.example>', subject: 'The launch, with numbers' },
    { from: 'Stratechery <ben@stratechery.example>', subject: 'Bundling the launch' },
  ]
  for (const n of newsletters) {
    const row = await seedMessage(testUserId, {
      subject: n.subject,
      from_address: n.from,
      body_plain: `Full newsletter body about the launch. ${'padding '.repeat(80)}`,
    })
    launchGmailIds.push(row.gmail_id)
    await seedChunk(row.id, testUserId, QUERY_VECTOR)
  }

  // Extra coverage so digest's wider net can return more than search's cap.
  for (let i = 0; i < MATCH_COUNT; i++) {
    const extra = await seedMessage(testUserId, {
      subject: `Launch recap ${i}`,
      from_address: `extra${i}@news.example`,
    })
    await seedChunk(extra.id, testUserId, QUERY_VECTOR)
  }

  const distractor = await seedMessage(testUserId, { subject: 'Unrelated terraform pipeline' })
  await seedChunk(distractor.id, testUserId, OTHER_VECTOR)

  const trash = await seedMessage(testUserId, {
    subject: 'Trashed launch recap',
    status: 'trash',
    label_ids: ['TRASH'],
    from_address: 'Trash Letter <trash@news.example>',
  })
  await seedChunk(trash.id, testUserId, QUERY_VECTOR)
})

afterAll(async () => {
  await cleanupUser(testUserId)
})

beforeEach(() => {
  embedText.mockReset()
  embedText.mockImplementation(async () => QUERY_VECTOR)
  reason.mockReset()
  reason.mockResolvedValue({
    text: 'TLDR, The Verge, and Stratechery all covered the launch.',
    available: true,
  })
})

describe('GET /api/v1/messages/digest', () => {
  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes()
    await handler(mockReq({ method: 'POST', query: { q: 'the launch' } }), res)
    expect(state.statusCode).toBe(405)
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED')
  })

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes()
    await handler(mockReq({ method: 'GET', query: { q: 'the launch' } }), res)
    expect(state.statusCode).toBe(401)
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
  })

  it('400 MISSING_QUERY — q param absent', async () => {
    const { state, res } = mockRes()
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: {} }),
      res,
    )
    expect(state.statusCode).toBe(400)
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_QUERY')
  })

  it('400 MISSING_QUERY — q is whitespace only', async () => {
    const { state, res } = mockRes()
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: '   ' } }),
      res,
    )
    expect(state.statusCode).toBe(400)
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_QUERY')
  })

  it('200 — returns a brief over more sources than search, without collapsing by sender', async () => {
    const { state, res } = mockRes()
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'the launch' } }),
      res,
    )
    expect(state.statusCode).toBe(200)
    expect(embedText).toHaveBeenCalledWith('the launch')
    expect(reason).toHaveBeenCalledTimes(1)

    const body = state.body as {
      messages: Message[]
      nextCursor: string | null
      digest: string | null
      reasonUnavailable: boolean
    }
    expect(body.nextCursor).toBeNull()
    expect(body.reasonUnavailable).toBe(false)
    expect(body.digest).toBe('TLDR, The Verge, and Stratechery all covered the launch.')
    expect(body.messages.every((m) => m.userId === testUserId)).toBe(true)
    expect(body.messages.some((m) => m.status === 'trash')).toBe(false)
    expect(body.messages.some((m) => m.subject.includes('terraform'))).toBe(false)

    const froms = body.messages.map((m) => m.from)
    expect(froms.some((f) => f.includes('TLDR'))).toBe(true)
    expect(froms.some((f) => f.includes('The Verge'))).toBe(true)
    expect(froms.some((f) => f.includes('Stratechery'))).toBe(true)

    expect(body.messages.length).toBeGreaterThan(MATCH_COUNT)
    expect(body.messages.length).toBeLessThanOrEqual(DIGEST_COUNT)

    const args = reason.mock.calls[0]?.[0]
    expect(args?.prompt).toBe('the launch')
    expect(args?.context.length).toBe(body.messages.length)
    expect(args?.context.every((c) => (c.bodyPlain?.length ?? 0) <= EXCERPT_CHARS + 1)).toBe(true)
    expect(args?.systemInstruction).toMatch(/agree/i)
  })

  it('200 — does not return another user\'s mail even when the vectors match', async () => {
    const other = await seedUser()
    const otherMsg = await seedMessage(other.id, {
      subject: 'The launch',
      from_address: 'Foreign Desk <other@news.example>',
    })
    await seedChunk(otherMsg.id, other.id, QUERY_VECTOR)

    const { state, res } = mockRes()
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'the launch' } }),
      res,
    )
    const messages = (state.body as { messages: Message[] }).messages
    expect(messages.every((m) => m.userId === testUserId)).toBe(true)
    expect(messages.some((m) => m.gmailId === otherMsg.gmail_id)).toBe(false)

    await cleanupUser(other.id)
  })

  it('200 — nothing relevant does not call reason', async () => {
    embedText.mockImplementation(async () => unitEmbedding(3))
    const { state, res } = mockRes()
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'xylophone photosynthesis' },
      }),
      res,
    )
    expect(state.statusCode).toBe(200)
    expect(reason).not.toHaveBeenCalled()
    const body = state.body as { messages: Message[]; digest: string | null }
    expect(body.messages).toHaveLength(0)
    expect(body.digest).toBeNull()
  })

  it('200 — when reason is unavailable, lists the matching newsletters instead', async () => {
    reason.mockResolvedValue({ text: null, available: false })
    const { state, res } = mockRes()
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'the launch' } }),
      res,
    )
    expect(state.statusCode).toBe(200)
    const body = state.body as {
      messages: Message[]
      digest: string | null
      reasonUnavailable: boolean
    }
    expect(body.reasonUnavailable).toBe(true)
    expect(body.digest).toMatch(/Matching newsletters/)
    expect(body.digest).toMatch(/TLDR/)
    expect(body.digest).toMatch(/The Verge/)
    expect(body.digest).toMatch(/Stratechery/)
    expect(body.messages.length).toBeGreaterThanOrEqual(3)
  })
})

async function seedChunk(messageId: string, userId: string, embedding: number[]): Promise<void> {
  const { error } = await getTestClient().from('message_chunks').insert({
    message_id: messageId,
    user_id: userId,
    chunk_index: 0,
    chunk_text: 'seed chunk',
    embedding: JSON.stringify(embedding),
  })
  if (error) throw new Error(`seedChunk failed: ${error.message}`)
}

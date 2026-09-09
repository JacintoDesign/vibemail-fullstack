/**
 * Integration tests for GET /api/v1/messages/:id/related
 *
 * Uses the origin row's stored embedding — embedText must never run.
 * match_messages still hits live Supabase.
 */

import handler from '../../src/routes/messages/related'
import * as embedClient from '../../src/memory/embedClient'
import { RELATED_COUNT } from '../../src/memory/related'
import { signJwt } from '../../src/middleware/jwt'
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase'
import { mockReq, mockRes } from '../helpers/request'
import type { Message } from '../../src/types/message'

jest.mock('../../src/memory/embedClient', () => ({
  embedText: jest.fn(),
}))

const embedText = jest.mocked(embedClient.embedText)

function unitEmbedding(axis: number): number[] {
  const v = Array.from({ length: 384 }, () => 0)
  v[axis] = 1
  return v
}

const STORY_VECTOR = unitEmbedding(0)
const OTHER_VECTOR = unitEmbedding(1)

let testUserId: string
let authHeader: string
let originGmailId: string
let originId: string
let originThreadId: string
let neighborGmailIds: string[]
let sameThreadGmailId: string
let orthogonalGmailId: string
let trashGmailId: string

beforeAll(async () => {
  const user = await seedUser()
  testUserId = user.id
  authHeader = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`

  const origin = await seedMessage(testUserId, {
    subject: 'Origin story',
    thread_id: `thread_origin_${user.id}`,
  })
  originGmailId = origin.gmail_id
  originId = origin.id
  originThreadId = `thread_origin_${user.id}`
  await seedChunk(origin.id, testUserId, STORY_VECTOR)

  neighborGmailIds = []
  for (let i = 0; i < 5; i++) {
    const n = await seedMessage(testUserId, {
      subject: `Neighbor ${i}`,
      from_address: `other${i}@example.com`,
    })
    neighborGmailIds.push(n.gmail_id)
    await seedChunk(n.id, testUserId, STORY_VECTOR)
  }

  const sameThread = await seedMessage(testUserId, {
    subject: 'Same thread as origin',
    thread_id: originThreadId,
  })
  sameThreadGmailId = sameThread.gmail_id
  await seedChunk(sameThread.id, testUserId, STORY_VECTOR)

  const orthogonal = await seedMessage(testUserId, { subject: 'Unrelated terraform pipeline' })
  orthogonalGmailId = orthogonal.gmail_id
  await seedChunk(orthogonal.id, testUserId, OTHER_VECTOR)

  const trash = await seedMessage(testUserId, {
    subject: 'Trashed neighbor',
    status: 'trash',
    label_ids: ['TRASH'],
  })
  trashGmailId = trash.gmail_id
  await seedChunk(trash.id, testUserId, STORY_VECTOR)
})

afterAll(async () => {
  await cleanupUser(testUserId)
})

beforeEach(() => {
  embedText.mockReset()
  embedText.mockImplementation(async () => {
    throw new Error('embedText must not be called for related')
  })
})

describe('GET /api/v1/messages/:id/related', () => {
  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes()
    await handler(mockReq({ method: 'POST', query: { id: originGmailId } }), res)
    expect(state.statusCode).toBe(405)
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED')
  })

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes()
    await handler(mockReq({ method: 'GET', query: { id: originGmailId } }), res)
    expect(state.statusCode).toBe(401)
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
  })

  it('404 MESSAGE_NOT_FOUND — unknown gmail id', async () => {
    const { state, res } = mockRes()
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { id: 'does-not-exist' },
      }),
      res,
    )
    expect(state.statusCode).toBe(404)
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND')
  })

  it('200 — neighbors of the stored vector, origin and its thread omitted, capped, no embed', async () => {
    const { state, res } = mockRes()
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { id: originGmailId },
      }),
      res,
    )
    expect(state.statusCode).toBe(200)
    expect(embedText).not.toHaveBeenCalled()
    const messages = (state.body as { messages: Message[] }).messages
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages.length).toBeLessThanOrEqual(RELATED_COUNT)
    expect(messages.every((m) => m.userId === testUserId)).toBe(true)
    expect(messages.some((m) => m.gmailId === originGmailId || m.id === originId)).toBe(false)
    expect(messages.some((m) => m.threadId === originThreadId)).toBe(false)
    expect(messages.some((m) => m.gmailId === sameThreadGmailId)).toBe(false)
    expect(messages.some((m) => m.gmailId === orthogonalGmailId)).toBe(false)
    expect(messages.some((m) => m.gmailId === trashGmailId || m.status === 'trash')).toBe(false)
    expect(messages.every((m) => neighborGmailIds.includes(m.gmailId))).toBe(true)
  })

  it('200 — empty list when the origin has no stored embedding', async () => {
    const bare = await seedMessage(testUserId, { subject: 'No chunks' })
    const { state, res } = mockRes()
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { id: bare.gmail_id },
      }),
      res,
    )
    expect(state.statusCode).toBe(200)
    expect(embedText).not.toHaveBeenCalled()
    expect((state.body as { messages: Message[] }).messages).toEqual([])
  })

  it('200 — empty list when nothing else clears the threshold', async () => {
    const lone = await seedMessage(testUserId, { subject: 'Lone vector' })
    await seedChunk(lone.id, testUserId, unitEmbedding(3))
    const { state, res } = mockRes()
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { id: lone.gmail_id },
      }),
      res,
    )
    expect(state.statusCode).toBe(200)
    expect((state.body as { messages: Message[] }).messages).toEqual([])
  })

  it('200 — does not return another user\'s mail even when the vectors match', async () => {
    const other = await seedUser()
    const otherMsg = await seedMessage(other.id, { subject: 'Foreign neighbor' })
    await seedChunk(otherMsg.id, other.id, STORY_VECTOR)

    const { state, res } = mockRes()
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { id: originGmailId },
      }),
      res,
    )
    const messages = (state.body as { messages: Message[] }).messages
    expect(messages.every((m) => m.userId === testUserId)).toBe(true)
    expect(messages.some((m) => m.gmailId === otherMsg.gmail_id)).toBe(false)

    await cleanupUser(other.id)
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

/**
 * Integration tests for GET /api/v1/messages/semantic
 *
 * embedText and reason are mocked so tests don't hit the live edge function
 * or the reasoning provider. Chunks are seeded with a known unit vector;
 * match_messages runs against live Supabase.
 */

import handler from '../../src/routes/messages/semantic';
import * as embedClient from '../../src/memory/embedClient';
import * as reasonMod from '../../src/reason';
import { MATCH_COUNT } from '../../src/memory/retrieve';
import { signJwt } from '../../src/middleware/jwt';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';
import type { Message } from '../../src/types/message';

jest.mock('../../src/memory/embedClient', () => ({
  embedText: jest.fn(),
}));

jest.mock('../../src/reason', () => ({
  reason: jest.fn(),
}));

const embedText = jest.mocked(embedClient.embedText);
const reason = jest.mocked(reasonMod.reason);

/** Unit vector along axis `axis` — inner product with itself is 1 (`<#> = -1`). */
function unitEmbedding(axis: number): number[] {
  const v = Array.from({ length: 384 }, () => 0);
  v[axis] = 1;
  return v;
}

const QUERY_VECTOR = unitEmbedding(0);
const OTHER_VECTOR = unitEmbedding(1);

let testUserId: string;
let authHeader: string;
let ownedGmailId: string;
let ownedMessageId: string;

beforeAll(async () => {
  const user = await seedUser();
  testUserId = user.id;
  authHeader = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`;

  const owned = await seedMessage(testUserId, { subject: 'Photorealistic image tools roundup' });
  ownedGmailId = owned.gmail_id;
  ownedMessageId = owned.id;
  await seedChunk(owned.id, testUserId, QUERY_VECTOR);

  const distractor = await seedMessage(testUserId, { subject: 'Unrelated terraform pipeline' });
  await seedChunk(distractor.id, testUserId, OTHER_VECTOR);
});

afterAll(async () => {
  await cleanupUser(testUserId);
});

beforeEach(() => {
  embedText.mockReset();
  embedText.mockImplementation(async () => QUERY_VECTOR);
  reason.mockReset();
  reason.mockResolvedValue({ text: 'From Photorealistic image tools roundup.', available: true });
});

describe('GET /api/v1/messages/semantic', () => {
  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST', query: { q: 'test' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { q: 'image tools' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed JWT', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: 'Bearer bad.jwt' }, query: { q: 'image tools' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('400 MISSING_QUERY — q param absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: {} }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_QUERY');
  });

  it('400 MISSING_QUERY — q is whitespace only', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: '   ' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_QUERY');
  });

  it('200 — returns the signed-in user\'s nearest message and embeds with embedText', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'image tools' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(embedText).toHaveBeenCalledWith('image tools');
    expect(reason).not.toHaveBeenCalled();
    const body = state.body as { messages: Message[]; nextCursor: string | null; answer: string | null };
    expect(body.nextCursor).toBeNull();
    expect(body.answer).toBeNull();
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages.length).toBeLessThanOrEqual(MATCH_COUNT);
    expect(body.messages[0]?.gmailId).toBe(ownedGmailId);
    expect(body.messages.every((m) => m.userId === testUserId)).toBe(true);
    expect(body.messages.some((m) => m.subject.includes('terraform'))).toBe(false);
  });

  it('200 — does not return another user\'s mail even when the vectors match', async () => {
    const other = await seedUser();
    const otherMsg = await seedMessage(other.id, { subject: 'Photorealistic image tools roundup' });
    await seedChunk(otherMsg.id, other.id, QUERY_VECTOR);

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'picture from a written description' } }),
      res,
    );
    const messages = (state.body as { messages: Message[] }).messages;
    expect(messages.every((m) => m.userId === testUserId)).toBe(true);
    expect(messages.some((m) => m.gmailId === otherMsg.gmail_id)).toBe(false);
    expect(messages.some((m) => m.id === ownedMessageId || m.gmailId === ownedGmailId)).toBe(true);

    await cleanupUser(other.id);
  });

  it('200 — returns no messages when nothing clears the threshold and keyword also misses', async () => {
    embedText.mockImplementation(async () => unitEmbedding(3));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'xylophone photosynthesis' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as {
      messages: Message[];
      nextCursor: string | null;
      answer: string | null;
      source: string;
    };
    expect(body.messages).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
    expect(body.answer).toBeNull();
    expect(body.source).toBe('keyword');
    expect(reason).not.toHaveBeenCalled();
  });

  it('200 — a question with no hits does not call reason', async () => {
    embedText.mockImplementation(async () => unitEmbedding(3));
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'did anyone mention xylophones?' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(reason).not.toHaveBeenCalled();
    expect((state.body as { answer: string | null }).answer).toBeNull();
  });

  it('200 — falls back to keyword search without an answer when nothing clears the threshold', async () => {
    embedText.mockImplementation(async () => unitEmbedding(3));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'terraform' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(reason).not.toHaveBeenCalled();
    const body = state.body as { messages: Message[]; answer: string | null; source: string };
    expect(body.source).toBe('keyword');
    expect(body.answer).toBeNull();
    expect(body.messages.some((m) => m.subject.includes('terraform'))).toBe(true);
  });

  it('200 — a question that only keyword-matches does not call reason', async () => {
    embedText.mockImplementation(async () => unitEmbedding(3));
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'what is terraform?' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(reason).not.toHaveBeenCalled();
    const body = state.body as { messages: Message[]; answer: string | null; source: string };
    expect(body.source).toBe('keyword');
    expect(body.answer).toBeNull();
    expect(body.messages.some((m) => m.subject.includes('terraform'))).toBe(true);
  });

  it('200 — a question calls reason with the retrieved messages and returns the answer', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'did any newsletter mention image tools?' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(reason).toHaveBeenCalledTimes(1);
    const args = reason.mock.calls[0]?.[0];
    expect(args?.prompt).toBe('did any newsletter mention image tools?');
    expect(args?.context.some((c) => c.subject.includes('Photorealistic'))).toBe(true);
    expect(args?.systemInstruction).toMatch(/newsletter/i);
    const body = state.body as { messages: Message[]; answer: string | null };
    expect(body.answer).toBe('From Photorealistic image tools roundup.');
    expect(body.messages.some((m) => m.gmailId === ownedGmailId)).toBe(true);
  });

  it('200 — a free-text prompt also calls reason', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'tools that draw a picture from text' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(reason).toHaveBeenCalledTimes(1);
    expect((state.body as { answer: string | null }).answer).toBe('From Photorealistic image tools roundup.');
  });

  it('200 — when reason is unavailable, still returns messages and no answer', async () => {
    reason.mockResolvedValue({ text: null, available: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'what did they say about image tools?' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as {
      messages: Message[];
      answer: string | null;
      reasonUnavailable: boolean;
    };
    expect(body.answer).toBeNull();
    expect(body.reasonUnavailable).toBe(true);
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('200 — when reason throws, still returns messages, no answer, and the unavailable flag', async () => {
    reason.mockRejectedValue(new Error('model overloaded'));
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { q: 'what did they say about image tools?' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as {
      messages: Message[];
      answer: string | null;
      reasonUnavailable: boolean;
    };
    expect(body.answer).toBeNull();
    expect(body.reasonUnavailable).toBe(true);
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
  });
});

async function seedChunk(messageId: string, userId: string, embedding: number[]): Promise<void> {
  const { error } = await getTestClient().from('message_chunks').insert({
    message_id: messageId,
    user_id: userId,
    chunk_index: 0,
    chunk_text: 'seed chunk',
    embedding: JSON.stringify(embedding),
  });
  if (error) throw new Error(`seedChunk failed: ${error.message}`);
}

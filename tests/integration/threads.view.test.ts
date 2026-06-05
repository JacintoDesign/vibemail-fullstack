/**
 * Integration tests for GET /api/v1/threads/:threadId (§4.6 — Thread View)
 *
 * - Supabase is live (no Gmail API calls)
 * - Messages are seeded directly into the database
 *
 * Covers every error.code listed in CONTRACT.md §4.6:
 *   200 (single message, multiple messages, oldest-first order),
 *   UNAUTHORIZED, THREAD_NOT_FOUND
 *
 * NOTE: requires the schema migration to be applied (status, draft_id columns).
 */

import handler from '../../api/v1/threads/[threadId]';
import { signJwt } from '../../src/middleware/jwt';
import { seedUser, seedMessage, cleanupUser } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';
import type { Message } from '../../src/types/message';

let testUserId: string;
let authHeader:  string;

beforeAll(async () => {
  const user = await seedUser();
  testUserId = user.id;
  authHeader = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`;
});

afterAll(async () => {
  await cleanupUser(testUserId);
});

describe('GET /api/v1/threads/:threadId', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST', query: { threadId: 'any' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { threadId: 'thread_abc' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed JWT', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: 'Bearer bad.jwt' }, query: { threadId: 'thread_abc' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── THREAD_NOT_FOUND ───────────────────────────────────────────────────────

  it('404 THREAD_NOT_FOUND — no messages for this threadId', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId: 'nonexistent_thread_xyz' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('THREAD_NOT_FOUND');
  });

  it('404 THREAD_NOT_FOUND — thread exists but belongs to different user', async () => {
    const other    = await seedUser();
    const threadId = `thread_other_${Date.now()}`;
    await seedMessage(other.id, { thread_id: threadId });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('THREAD_NOT_FOUND');
    await cleanupUser(other.id);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('200 — returns all messages in a thread', async () => {
    const threadId = `thread_happy_${Date.now()}`;
    await seedMessage(testUserId, { thread_id: threadId });
    await seedMessage(testUserId, { thread_id: threadId });
    await seedMessage(testUserId, { thread_id: threadId });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { threadId: string; messages: Message[] };
    expect(body.threadId).toBe(threadId);
    expect(body.messages).toHaveLength(3);
    expect(body.messages.every(m => m.threadId === threadId)).toBe(true);
  });

  it('200 — messages are ordered oldest-first (ascending createdAt)', async () => {
    const threadId = `thread_order_${Date.now()}`;
    // Insert with small delays to ensure distinct created_at values.
    await seedMessage(testUserId, { thread_id: threadId, subject: 'First' });
    await new Promise(r => setTimeout(r, 20));
    await seedMessage(testUserId, { thread_id: threadId, subject: 'Second' });
    await new Promise(r => setTimeout(r, 20));
    await seedMessage(testUserId, { thread_id: threadId, subject: 'Third' });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const messages = (state.body as { messages: Message[] }).messages;
    expect(messages).toHaveLength(3);
    // Verify ascending order by createdAt timestamp.
    for (let i = 1; i < messages.length; i++) {
      expect(new Date(messages[i].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(messages[i - 1].createdAt).getTime());
    }
  });

  it('200 — single-message thread returns array of length 1', async () => {
    const threadId = `thread_single_${Date.now()}`;
    const msg = await seedMessage(testUserId, { thread_id: threadId });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { threadId: string; messages: Message[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].gmailId).toBe(msg.gmail_id);
  });

  it('200 — only returns messages belonging to the authenticated user', async () => {
    const other    = await seedUser();
    const threadId = `thread_isolation_${Date.now()}`;

    // Both users have messages in the same thread.
    await seedMessage(testUserId, { thread_id: threadId });
    await seedMessage(other.id,   { thread_id: threadId });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const messages = (state.body as { messages: Message[] }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].userId).toBe(testUserId);
    await cleanupUser(other.id);
  });

  it('200 — response includes all CONTRACT.md §3 Message fields', async () => {
    const threadId = `thread_fields_${Date.now()}`;
    await seedMessage(testUserId, { thread_id: threadId });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { threadId } }),
      res,
    );
    const msg = (state.body as { messages: Message[] }).messages[0];
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('gmailId');
    expect(msg).toHaveProperty('threadId');
    expect(msg).toHaveProperty('from');
    expect(msg).toHaveProperty('to');
    expect(msg).toHaveProperty('subject');
    expect(msg).toHaveProperty('isRead');
    expect(msg).toHaveProperty('isStarred');
    expect(msg).toHaveProperty('status');
  });
});

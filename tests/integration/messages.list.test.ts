/**
 * Integration tests for GET /api/v1/messages
 *
 * Reads from a live Supabase instance seeded in beforeAll.
 * No Gmail API calls are made by this endpoint.
 *
 * Covers every error.code listed in CONTRACT.md §4.2:
 *   200 (happy path, cursor, labelId filter), UNAUTHORIZED, INVALID_LIMIT
 *
 * Note: SCOPE_MISSING and GMAIL_RATE_LIMITED are listed in CONTRACT.md §4.2
 * but are not reachable from the current implementation of handleList (which
 * reads from Supabase and makes no Gmail API calls). Their HTTP status
 * mappings are verified in tests/unit/middleware.test.ts.
 *
 * GMAIL_LIST_FAILED is triggered by a Supabase infrastructure error. Its
 * 502 mapping is also covered by the middleware unit test.
 */

import handler from '../../api/v1/messages';
import { signJwt } from '../../src/middleware/jwt';
import { seedUser, seedMessage, cleanupUser } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';

let testUserId:  string;
let authHeader:  string;

beforeAll(async () => {
  const user  = await seedUser();
  testUserId  = user.id;
  authHeader  = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`;

  // Seed messages to paginate and filter against
  await seedMessage(testUserId, { label_ids: ['INBOX', 'UNREAD'] });
  await seedMessage(testUserId, { label_ids: ['INBOX'] });
  await seedMessage(testUserId, { label_ids: ['SENT'] });
});

afterAll(async () => {
  await cleanupUser(testUserId);
});

describe('GET /api/v1/messages', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects non-GET/POST methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'DELETE' }), res);
    expect(state.statusCode).toBe(405);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('200 — returns messages array and nextCursor', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: authHeader } }), res);
    expect(state.statusCode).toBe(200);
    const body = state.body as { messages: unknown[]; nextCursor: string | null };
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body).toHaveProperty('nextCursor');
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('200 — each message has all CONTRACT.md §3 fields', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: authHeader } }), res);
    const { messages } = state.body as { messages: Record<string, unknown>[] };
    const msg = messages[0];
    for (const field of [
      'id', 'userId', 'createdAt', 'updatedAt',
      'gmailId', 'threadId', 'labelIds',
      'from', 'to', 'subject', 'date', 'snippet',
      'isRead', 'isStarred',
    ]) {
      expect(msg).toHaveProperty(field);
    }
    // from_address / to_address must NOT leak through
    expect(msg).not.toHaveProperty('from_address');
    expect(msg).not.toHaveProperty('to_address');
  });

  it('200 — messages are ordered newest-first', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: authHeader } }), res);
    const { messages } = state.body as { messages: { createdAt: string }[] };
    if (messages.length < 2) return;
    const dates = messages.map(m => new Date(m.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('200 — respects limit and returns a non-null nextCursor when more pages exist', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { limit: '1' },
      }),
      res,
    );
    const body = state.body as { messages: unknown[]; nextCursor: string | null };
    expect(body.messages.length).toBe(1);
    expect(body.nextCursor).not.toBeNull();
  });

  it('200 — cursor fetches the next page with a different message', async () => {
    // Page 1
    const { state: s1, res: r1 } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { limit: '1' },
      }),
      r1,
    );
    const cursor = (s1.body as { nextCursor: string | null }).nextCursor;
    if (!cursor) return; // only one message exists — skip

    // Page 2
    const { state: s2, res: r2 } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { limit: '1', cursor },
      }),
      r2,
    );
    expect(s2.statusCode).toBe(200);
    const p1Id = (s1.body as { messages: { id: string }[] }).messages[0]?.id;
    const p2Id = (s2.body as { messages: { id: string }[] }).messages[0]?.id;
    expect(p2Id).toBeDefined();
    expect(p2Id).not.toBe(p1Id);
  });

  it('200 — filters by labelId, only returning messages with that label', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { labelId: 'SENT' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const { messages } = state.body as { messages: { labelIds: string[] }[] };
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.every(m => m.labelIds.includes('SENT'))).toBe(true);
  });

  it('200 — nextCursor is null on the last page', async () => {
    // Request more messages than exist
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { limit: '100' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { nextCursor: null }).nextCursor).toBeNull();
  });

  it('200 — returns empty messages array when no messages match the label filter', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        headers: { authorization: authHeader },
        query: { labelId: 'LABEL_THAT_DOES_NOT_EXIST' },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { messages: unknown[] }).messages).toHaveLength(0);
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — token is syntactically malformed', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: 'Bearer not.a.real.jwt' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — JWT signed with wrong secret', async () => {
    const jwt    = require('jsonwebtoken');
    const forged = jwt.sign({ sub: 'x', email: 'x@x.com', name: 'X' }, 'wrong_secret', { expiresIn: '1h' });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: `Bearer ${forged}` } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── INVALID_LIMIT ──────────────────────────────────────────────────────────

  it('422 INVALID_LIMIT — limit=0 (below minimum of 1)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { limit: '0' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  it('422 INVALID_LIMIT — limit=101 (above maximum of 100)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { limit: '101' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  it('422 INVALID_LIMIT — limit is a non-numeric string', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { limit: 'abc' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  it('422 INVALID_LIMIT — limit is a float (non-integer)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { limit: '2.5' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  // ── Isolation ─────────────────────────────────────────────────────────────

  it('200 — a different authenticated user sees zero messages from the test user', async () => {
    const otherUser    = await seedUser();
    const otherHeader  = `Bearer ${signJwt({ sub: otherUser.id, email: otherUser.email, name: 'Other' })}`;

    try {
      const { state, res } = mockRes();
      await handler(
        mockReq({ method: 'GET', headers: { authorization: otherHeader } }),
        res,
      );
      expect(state.statusCode).toBe(200);
      expect((state.body as { messages: unknown[] }).messages).toHaveLength(0);
    } finally {
      await cleanupUser(otherUser.id);
    }
  });
});

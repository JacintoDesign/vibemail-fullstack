/**
 * Integration tests for GET /api/v1/messages/search (§4.7 — Message Search)
 *
 * - Supabase is live (no Gmail API calls)
 * - Messages are seeded directly into the database
 *
 * Covers every error.code listed in CONTRACT.md §4.7:
 *   200 (subject match, from match, snippet match, pagination, no results),
 *   MISSING_QUERY, INVALID_LIMIT, UNAUTHORIZED
 *
 * NOTE: requires the schema migration to be applied (status, draft_id columns).
 */

import handler from '../../src/routes/messages/search';
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

  // Seed a known set of messages for search tests.
  await seedMessage(testUserId, { subject: 'Invoice for March', snippet: 'Please find attached' });
  await seedMessage(testUserId, { subject: 'Meeting tomorrow', snippet: 'Let us sync up' });
  await seedMessage(testUserId, { subject: 'Welcome to VibeMail', from_address: 'noreply@vibemail-test.invalid', snippet: 'Get started today' });
});

afterAll(async () => {
  await cleanupUser(testUserId);
});

describe('GET /api/v1/messages/search', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST', query: { q: 'test' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { q: 'invoice' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed JWT', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: 'Bearer bad.jwt' }, query: { q: 'invoice' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── MISSING_QUERY ──────────────────────────────────────────────────────────

  it('400 MISSING_QUERY — q param absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: {} }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_QUERY');
  });

  it('400 MISSING_QUERY — q is empty string', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: '' } }),
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

  // ── INVALID_LIMIT ──────────────────────────────────────────────────────────

  it('422 INVALID_LIMIT — limit=0', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'invoice', limit: '0' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  it('422 INVALID_LIMIT — limit=101', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'invoice', limit: '101' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  it('422 INVALID_LIMIT — limit is non-numeric', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'invoice', limit: 'abc' } }),
      res,
    );
    expect(state.statusCode).toBe(422);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_LIMIT');
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('200 — matches by subject (case-insensitive)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'invoice' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { messages: Message[]; nextCursor: string | null };
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages.every(m => m.subject.toLowerCase().includes('invoice'))).toBe(true);
  });

  it('200 — matches by from_address', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'noreply@vibemail-test.invalid' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const messages = (state.body as { messages: Message[] }).messages;
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some(m => m.from.includes('vibemail-test.invalid'))).toBe(true);
  });

  it('200 — matches by snippet', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'sync up' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const messages = (state.body as { messages: Message[] }).messages;
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('200 — returns empty messages array and null nextCursor when no results', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'zzznomatchxxx9999' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { messages: Message[]; nextCursor: string | null };
    expect(body.messages).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
  });

  it('200 — response includes nextCursor and messages fields', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'test' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as Record<string, unknown>;
    expect(body).toHaveProperty('messages');
    expect(body).toHaveProperty('nextCursor');
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('200 — only returns messages belonging to the authenticated user', async () => {
    const other = await seedUser();
    await seedMessage(other.id, { subject: 'invoice other user' });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: 'invoice' } }),
      res,
    );
    const messages = (state.body as { messages: Message[] }).messages;
    expect(messages.every(m => m.userId === testUserId)).toBe(true);
    await cleanupUser(other.id);
  });

  it('200 — pagination: limit=1 returns nextCursor when more results exist', async () => {
    // Seed two messages that share a distinctive subject term.
    const tag = `pagtest_${Date.now()}`;
    await seedMessage(testUserId, { subject: `pagination ${tag}` });
    await seedMessage(testUserId, { subject: `pagination ${tag}` });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: `pagination ${tag}`, limit: '1' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { messages: Message[]; nextCursor: string | null };
    expect(body.messages).toHaveLength(1);
    expect(body.nextCursor).not.toBeNull();
  });

  it('200 — second page via cursor returns remaining results', async () => {
    const tag = `pagtest2_${Date.now()}`;
    await seedMessage(testUserId, { subject: `cursor ${tag}` });
    await seedMessage(testUserId, { subject: `cursor ${tag}` });

    // First page.
    const { state: s1, res: r1 } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: `cursor ${tag}`, limit: '1' } }),
      r1,
    );
    const cursor = (s1.body as { nextCursor: string }).nextCursor;

    // Second page.
    const { state: s2, res: r2 } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { q: `cursor ${tag}`, limit: '1', cursor } }),
      r2,
    );
    expect(s2.statusCode).toBe(200);
    expect((s2.body as { messages: Message[] }).messages).toHaveLength(1);
  });
});

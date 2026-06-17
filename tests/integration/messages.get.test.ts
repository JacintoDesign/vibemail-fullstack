/**
 * Integration tests for GET /api/v1/messages/:id (single-message fetch)
 *
 * - Supabase is live (reads are real)
 * - No Gmail call is made on this route (it reads the synced Supabase row)
 *
 * Covers: 200 (found), UNAUTHORIZED, MESSAGE_NOT_FOUND (missing + other user),
 * and the 405 method guard.
 */

import handler from '../../src/routes/messages/item';
import { signJwt } from '../../src/middleware/jwt';
import { seedUser, seedMessage, cleanupUser } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';

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

describe('GET /api/v1/messages/:id', () => {
  it('405 — rejects unsupported methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'PUT', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('404 MESSAGE_NOT_FOUND — gmail_id does not exist', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { id: 'nonexistent_get_000' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('404 MESSAGE_NOT_FOUND — message belongs to a different user', async () => {
    const other = await seedUser();
    const msg   = await seedMessage(other.id);
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
    await cleanupUser(other.id);
  });

  it('200 — returns the full message shape for an owned gmail_id', async () => {
    const msg = await seedMessage(testUserId, {
      subject: 'Hello GET',
      label_ids: ['INBOX', 'UNREAD'],
      is_read: false,
    });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'GET', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { message: { gmailId: string; subject: string; isRead: boolean; status: string } };
    expect(body.message.gmailId).toBe(msg.gmail_id);
    expect(body.message.subject).toBe('Hello GET');
    expect(body.message.isRead).toBe(false);
    expect(body.message.status).toBe('inbox');
  });
});

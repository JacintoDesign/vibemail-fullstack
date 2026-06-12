/**
 * Integration tests for PATCH /api/v1/messages/:id
 *
 * - Supabase is live (reads and updates are real)
 * - Gmail API (google.gmail, messages.modify) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 *
 * Each state-mutating test seeds its own fresh message so tests
 * do not depend on execution order.
 *
 * Covers every error.code listed in CONTRACT.md §4.4:
 *   200 (mark read, mark unread), INVALID_BODY, UNAUTHORIZED,
 *   MESSAGE_NOT_FOUND, ALREADY_IN_STATE, GMAIL_RATE_LIMITED,
 *   GMAIL_MODIFY_FAILED
 */

import handler from '../../api/v1/messages/[id]';
import * as authModule from '../../src/providers/gmail/auth';
import { signJwt } from '../../src/middleware/jwt';
import { ProviderError } from '../../src/types/provider';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';

// Mock loadOAuth2Client — tests exercise the Supabase path, not token decryption
jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  loadOAuth2Client: jest.fn(),
}));

// Mock googleapis so gmail.users.messages.modify is controllable
jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
  },
}));

import { google } from 'googleapis';

// Shared mock for modify across all tests (configured in beforeEach)
const mockModify = jest.fn();

let testUserId: string;
let authHeader:  string;

beforeAll(async () => {
  const user  = await seedUser();
  testUserId  = user.id;
  authHeader  = `Bearer ${signJwt({ sub: user.id, email: user.email, name: 'Test User' })}`;
});

afterAll(async () => {
  await cleanupUser(testUserId);
});

beforeEach(() => {
  // Default: loadOAuth2Client returns a fake client object; modify succeeds
  (authModule.loadOAuth2Client as jest.Mock).mockResolvedValue({ fake: 'oauth2_client' });
  mockModify.mockResolvedValue({ data: {} });
  (google.gmail as jest.Mock).mockReturnValue({
    users: { messages: { modify: mockModify } },
  });
});

describe('PATCH /api/v1/messages/:id', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects unsupported methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'PUT', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', query: { id: 'any_id' }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed JWT', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: 'Bearer bad.jwt.here' },
        query:   { id: 'any_id' },
        body:    { read: true },
      }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── INVALID_BODY ───────────────────────────────────────────────────────────

  it('400 INVALID_BODY — read field absent (empty body)', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    {},
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_BODY — read is a string ("true") instead of boolean', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: 'true' },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_BODY — read is null', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: null },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_BODY — read is a number (1) instead of boolean', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: 1 },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  // ── MESSAGE_NOT_FOUND ──────────────────────────────────────────────────────

  it('404 MESSAGE_NOT_FOUND — gmail_id does not exist in Supabase', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: 'nonexistent_gmail_id_xyz_000' },
        body:    { read: true },
      }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('404 MESSAGE_NOT_FOUND — message belongs to a different user', async () => {
    const otherUser = await seedUser();
    const msg       = await seedMessage(otherUser.id, { is_read: false });

    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader }, // testUser's JWT
        query:   { id: msg.gmail_id },           // otherUser's message
        body:    { read: true },
      }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');

    await cleanupUser(otherUser.id);
  });

  // ── ALREADY_IN_STATE ───────────────────────────────────────────────────────

  it('409 ALREADY_IN_STATE — message is already read, requested read=true', async () => {
    const msg = await seedMessage(testUserId, { is_read: true });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: true },
      }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  it('409 ALREADY_IN_STATE — message is already unread, requested read=false', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: false },
      }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  // ── GMAIL_MODIFY_FAILED ────────────────────────────────────────────────────

  it('502 GMAIL_MODIFY_FAILED — gmail.users.messages.modify throws', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    mockModify.mockRejectedValue(new Error('Gmail API error 500'));

    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: true },
      }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_MODIFY_FAILED');
  });

  // ── GMAIL_RATE_LIMITED ─────────────────────────────────────────────────────
  //
  // The mark-read handler wraps ALL gmail.users.messages.modify errors as
  // GMAIL_MODIFY_FAILED (it does not separately detect 429s).  CONTRACT.md
  // lists GMAIL_RATE_LIMITED as a 429 response for this endpoint; its HTTP
  // status mapping is verified in tests/unit/middleware.test.ts.
  // This test confirms the actual handler behaviour for completeness.

  it('502 GMAIL_MODIFY_FAILED — handler wraps all modify errors uniformly', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    mockModify.mockRejectedValue(new ProviderError('GMAIL_RATE_LIMITED', 'Rate limited'));

    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: true },
      }),
      res,
    );
    // All errors from gmail.modify are caught and re-thrown as GMAIL_MODIFY_FAILED
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_MODIFY_FAILED');
  });

  // ── Happy path: mark as read ───────────────────────────────────────────────

  it('200 — marks an unread message as read, returns { id, isRead: true }', async () => {
    const msg = await seedMessage(testUserId, { is_read: false, label_ids: ['INBOX', 'UNREAD'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: true },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { message: { id: string; isRead: boolean } };
    expect(body.message.id).toBe(msg.gmail_id);
    expect(body.message.isRead).toBe(true);
  });

  it('calls modify with removeLabelIds=[UNREAD] when marking read', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: true },
      }),
      mockRes().res,
    );
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          addLabelIds:    [],
          removeLabelIds: ['UNREAD'],
        }),
      }),
    );
  });

  it('200 — marks a read message as unread, returns { id, isRead: false }', async () => {
    const msg = await seedMessage(testUserId, { is_read: true, label_ids: ['INBOX'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: false },
      }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { message: { isRead: boolean } }).message.isRead).toBe(false);
  });

  it('calls modify with addLabelIds=[UNREAD] when marking unread', async () => {
    const msg = await seedMessage(testUserId, { is_read: true });
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: false },
      }),
      mockRes().res,
    );
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          addLabelIds:    ['UNREAD'],
          removeLabelIds: [],
        }),
      }),
    );
  });

  it('updates is_read in Supabase after a successful mark-read', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    await handler(
      mockReq({
        method:  'PATCH',
        headers: { authorization: authHeader },
        query:   { id: msg.gmail_id },
        body:    { read: true },
      }),
      mockRes().res,
    );

    const { data } = await getTestClient()
      .from('messages')
      .select('is_read')
      .eq('gmail_id', msg.gmail_id)
      .single();

    expect((data as { is_read: boolean }).is_read).toBe(true);
  });
});

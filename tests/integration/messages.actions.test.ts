/**
 * Integration tests for PATCH /api/v1/messages/:id (§4.5 — Message Actions)
 *
 * - Supabase is live (reads and writes are real)
 * - Gmail API (messages.modify) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 *
 * Covers every error.code listed in CONTRACT.md §4.5:
 *   200 (read, unread, star, unstar, archive, trash, multi-action),
 *   INVALID_BODY, UNAUTHORIZED, MESSAGE_NOT_FOUND, ALREADY_IN_STATE,
 *   GMAIL_RATE_LIMITED, GMAIL_MODIFY_FAILED
 *
 * NOTE: requires the schema migration to be applied (status, draft_id columns).
 */

import handler from '../../api/v1/messages/[id]';
import * as authModule from '../../src/providers/gmail/auth';
import { signJwt } from '../../src/middleware/jwt';
import { ProviderError } from '../../src/types/provider';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';

jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  loadOAuth2Client: jest.fn(),
}));

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
  },
}));

import { google } from 'googleapis';

const mockModify = jest.fn();

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

beforeEach(() => {
  (authModule.loadOAuth2Client as jest.Mock).mockResolvedValue({ fake: 'oauth2_client' });
  mockModify.mockResolvedValue({ data: {} });
  (google.gmail as jest.Mock).mockReturnValue({
    users: { messages: { modify: mockModify } },
  });
});

describe('PATCH /api/v1/messages/:id', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects non-PATCH methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'PATCH', query: { id: 'any' }, body: { read: true } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed JWT', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: 'Bearer bad.jwt' }, query: { id: 'any' }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── INVALID_BODY ───────────────────────────────────────────────────────────

  it('400 INVALID_BODY — empty body (no recognised fields)', async () => {
    const msg = await seedMessage(testUserId);
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: {} }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_BODY — read is a string instead of boolean', async () => {
    const msg = await seedMessage(testUserId);
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: 'true' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_BODY — starred is a number instead of boolean', async () => {
    const msg = await seedMessage(testUserId);
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { starred: 1 } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  // ── MESSAGE_NOT_FOUND ──────────────────────────────────────────────────────

  it('404 MESSAGE_NOT_FOUND — gmail_id does not exist', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: 'nonexistent_xyz_000' }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('404 MESSAGE_NOT_FOUND — message belongs to a different user', async () => {
    const other = await seedUser();
    const msg   = await seedMessage(other.id, { is_read: false });

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
    await cleanupUser(other.id);
  });

  // ── ALREADY_IN_STATE ───────────────────────────────────────────────────────

  it('409 ALREADY_IN_STATE — already read, requested read=true', async () => {
    const msg = await seedMessage(testUserId, { is_read: true });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  it('409 ALREADY_IN_STATE — already unread, requested read=false', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: false } }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  it('409 ALREADY_IN_STATE — already starred, requested starred=true', async () => {
    const msg = await seedMessage(testUserId, { is_starred: true, label_ids: ['INBOX', 'STARRED'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { starred: true } }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  // ── GMAIL_MODIFY_FAILED ────────────────────────────────────────────────────

  it('502 GMAIL_MODIFY_FAILED — messages.modify throws', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    mockModify.mockRejectedValue(new Error('Gmail API 500'));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_MODIFY_FAILED');
  });

  it('502 GMAIL_MODIFY_FAILED — wraps GMAIL_RATE_LIMITED from modify', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    mockModify.mockRejectedValue(new ProviderError('GMAIL_RATE_LIMITED', 'Rate limited'));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_MODIFY_FAILED');
  });

  // ── Happy path: read / unread ──────────────────────────────────────────────

  it('200 — marks unread message as read', async () => {
    const msg = await seedMessage(testUserId, { is_read: false, label_ids: ['INBOX', 'UNREAD'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { message: { id: string; isRead: boolean; isStarred: boolean; status: string } };
    expect(body.message.id).toBe(msg.gmail_id);
    expect(body.message.isRead).toBe(true);
  });

  it('calls modify with removeLabelIds=[UNREAD] when marking read', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      mockRes().res,
    );
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ removeLabelIds: expect.arrayContaining(['UNREAD']) }),
      }),
    );
  });

  it('200 — marks read message as unread', async () => {
    const msg = await seedMessage(testUserId, { is_read: true, label_ids: ['INBOX'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: false } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { message: { isRead: boolean } }).message.isRead).toBe(false);
  });

  it('updates is_read in Supabase after mark-read', async () => {
    const msg = await seedMessage(testUserId, { is_read: false });
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true } }),
      mockRes().res,
    );
    const { data } = await getTestClient().from('messages').select('is_read').eq('gmail_id', msg.gmail_id).single();
    expect((data as { is_read: boolean }).is_read).toBe(true);
  });

  // ── Happy path: star / unstar ──────────────────────────────────────────────

  it('200 — stars an unstarred message', async () => {
    const msg = await seedMessage(testUserId, { is_starred: false, label_ids: ['INBOX'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { starred: true } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { message: { isStarred: boolean } }).message.isStarred).toBe(true);
  });

  it('calls modify with addLabelIds=[STARRED] when starring', async () => {
    const msg = await seedMessage(testUserId, { is_starred: false });
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { starred: true } }),
      mockRes().res,
    );
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ addLabelIds: expect.arrayContaining(['STARRED']) }),
      }),
    );
  });

  it('200 — unstars a starred message', async () => {
    const msg = await seedMessage(testUserId, { is_starred: true, label_ids: ['INBOX', 'STARRED'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { starred: false } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { message: { isStarred: boolean } }).message.isStarred).toBe(false);
  });

  it('updates is_starred in Supabase after starring', async () => {
    const msg = await seedMessage(testUserId, { is_starred: false });
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { starred: true } }),
      mockRes().res,
    );
    const { data } = await getTestClient().from('messages').select('is_starred').eq('gmail_id', msg.gmail_id).single();
    expect((data as { is_starred: boolean }).is_starred).toBe(true);
  });

  // ── Happy path: archive ────────────────────────────────────────────────────

  it('200 — archives a message, status becomes archived', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX'], status: 'inbox' });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { archived: true } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { message: { status: string } }).message.status).toBe('archived');
  });

  it('calls modify with removeLabelIds containing INBOX when archiving', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX'], status: 'inbox' });
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { archived: true } }),
      mockRes().res,
    );
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ removeLabelIds: expect.arrayContaining(['INBOX']) }),
      }),
    );
  });

  // ── Happy path: trash ──────────────────────────────────────────────────────

  it('200 — trashes a message, status becomes trash', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX'], status: 'inbox' });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { trashed: true } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    expect((state.body as { message: { status: string } }).message.status).toBe('trash');
  });

  // ── Happy path: multi-action ───────────────────────────────────────────────

  it('200 — read + star in a single request applies both changes', async () => {
    const msg = await seedMessage(testUserId, { is_read: false, is_starred: false, label_ids: ['INBOX', 'UNREAD'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true, starred: true } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { message: { isRead: boolean; isStarred: boolean } };
    expect(body.message.isRead).toBe(true);
    expect(body.message.isStarred).toBe(true);
  });

  it('single modify call is made for multi-action requests', async () => {
    const msg = await seedMessage(testUserId, { is_read: false, is_starred: false });
    await handler(
      mockReq({ method: 'PATCH', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { read: true, starred: true } }),
      mockRes().res,
    );
    expect(mockModify).toHaveBeenCalledTimes(1);
  });
});

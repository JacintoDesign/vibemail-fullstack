/**
 * Integration tests for POST /api/v1/drafts (§4.8 — Draft Create)
 *
 * - Supabase is live (writes are real)
 * - Gmail API (drafts.create, messages.get, users.getProfile) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 *
 * Covers every error.code listed in CONTRACT.md §4.8:
 *   201 (new draft, threaded draft reply),
 *   MISSING_FIELDS, INVALID_RECIPIENT, UNAUTHORIZED, GMAIL_DRAFT_FAILED
 *
 * NOTE: requires the schema migration to be applied (status, draft_id columns).
 */

import handler from '../../api/v1/drafts';
import * as authModule from '../../src/providers/gmail/auth';
import { signJwt } from '../../src/middleware/jwt';
import { ProviderError } from '../../src/types/provider';
import { seedUser, cleanupUser, getTestClient } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';
import type { Message } from '../../src/types/message';

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

const FAKE_DRAFT_ID   = 'draft_abc_001';
const FAKE_GMAIL_ID   = 'msg_draft_abc_001';
const FAKE_THREAD_ID  = 'thread_draft_001';

const FAKE_FULL_MSG = {
  id:           FAKE_GMAIL_ID,
  threadId:     FAKE_THREAD_ID,
  labelIds:     ['DRAFT'],
  snippet:      'Draft snippet',
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From',    value: 'sender@example.com' },
      { name: 'To',      value: 'recipient@example.com' },
      { name: 'Subject', value: 'Draft subject' },
      { name: 'Date',    value: new Date().toUTCString() },
    ],
    mimeType: 'text/plain',
    body: { data: Buffer.from('Draft body').toString('base64url') },
  },
};

const mockDraftsCreate  = jest.fn();
const mockMessagesGet   = jest.fn();
const mockUsersGetProfile = jest.fn();

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

  mockUsersGetProfile.mockResolvedValue({ data: { emailAddress: 'sender@example.com' } });
  mockDraftsCreate.mockResolvedValue({
    data: {
      id:      FAKE_DRAFT_ID,
      message: { id: FAKE_GMAIL_ID },
    },
  });
  mockMessagesGet.mockResolvedValue({ data: FAKE_FULL_MSG });

  (google.gmail as jest.Mock).mockReturnValue({
    users: {
      getProfile: mockUsersGetProfile,
      messages:   { get: mockMessagesGet },
      drafts:     { create: mockDraftsCreate },
    },
  });
});

describe('POST /api/v1/drafts', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects non-POST methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', body: { to: 'r@example.com', subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed JWT', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: 'Bearer bad.jwt' }, body: { to: 'r@example.com', subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── MISSING_FIELDS ─────────────────────────────────────────────────────────

  it('400 MISSING_FIELDS — to absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('400 MISSING_FIELDS — subject absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('400 MISSING_FIELDS — body absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'S' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('400 MISSING_FIELDS — subject is empty string', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: '', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  // ── INVALID_RECIPIENT ──────────────────────────────────────────────────────

  it('400 INVALID_RECIPIENT — no @ symbol', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'not-an-email', subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_RECIPIENT');
  });

  it('400 INVALID_RECIPIENT — missing domain part', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'user@', subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_RECIPIENT');
  });

  // ── GMAIL_DRAFT_FAILED ─────────────────────────────────────────────────────

  it('502 GMAIL_DRAFT_FAILED — drafts.create throws', async () => {
    mockDraftsCreate.mockRejectedValue(new Error('Gmail API 500'));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_DRAFT_FAILED');
  });

  it('502 GMAIL_DRAFT_FAILED — drafts.create throws GMAIL_RATE_LIMITED', async () => {
    mockDraftsCreate.mockRejectedValue(new ProviderError('GMAIL_RATE_LIMITED', 'Rate limited'));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'S', body: 'B' } }),
      res,
    );
    expect(state.statusCode).toBe(429);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_RATE_LIMITED');
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('201 — creates a draft and returns the Message with status=draft', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'recipient@example.com', subject: 'Draft subject', body: 'Draft body' } }),
      res,
    );
    expect(state.statusCode).toBe(201);
    const body = state.body as { message: Message };
    expect(body.message.status).toBe('draft');
    expect(body.message.draftId).toBe(FAKE_DRAFT_ID);
    expect(body.message.gmailId).toBe(FAKE_GMAIL_ID);
  });

  it('201 — response includes all CONTRACT.md §3 Message fields', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'S', body: 'B' } }),
      res,
    );
    const msg = (state.body as { message: Message }).message;
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('gmailId');
    expect(msg).toHaveProperty('threadId');
    expect(msg).toHaveProperty('labelIds');
    expect(msg).toHaveProperty('from');
    expect(msg).toHaveProperty('to');
    expect(msg).toHaveProperty('subject');
    expect(msg).toHaveProperty('isRead');
    expect(msg).toHaveProperty('isStarred');
    expect(msg).toHaveProperty('status');
    expect(msg).toHaveProperty('draftId');
  });

  it('201 — persists draft row in Supabase with status=draft and draft_id set', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'Persist test', body: 'Body' } }),
      res,
    );
    expect(state.statusCode).toBe(201);

    // Verify the row was written.
    const { data } = await getTestClient()
      .from('messages')
      .select('gmail_id, status, draft_id')
      .eq('gmail_id', FAKE_GMAIL_ID)
      .eq('user_id', testUserId)
      .single();

    expect(data).not.toBeNull();
    const row = data as { gmail_id: string; status: string; draft_id: string };
    expect(row.status).toBe('draft');
    expect(row.draft_id).toBe(FAKE_DRAFT_ID);
  });

  it('201 — calls drafts.create with the encoded RFC 2822 raw message', async () => {
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'RFC test', body: 'Body' } }),
      mockRes().res,
    );
    expect(mockDraftsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          message: expect.objectContaining({ raw: expect.any(String) }),
        }),
      }),
    );
  });

  it('201 — includes threadId in drafts.create call when provided', async () => {
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, body: { to: 'r@example.com', subject: 'S', body: 'B', threadId: 'thread_xyz' } }),
      mockRes().res,
    );
    expect(mockDraftsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          message: expect.objectContaining({ threadId: 'thread_xyz' }),
        }),
      }),
    );
  });
});

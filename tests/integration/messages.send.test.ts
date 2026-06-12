/**
 * Integration tests for POST /api/v1/messages
 *
 * sendMessage (src/send/index.ts) is mocked — this tests the HTTP
 * contract of the send handler without making real Gmail API calls
 * or writing to Supabase.
 *
 * Covers every error.code listed in CONTRACT.md §4.3:
 *   201 (happy path), MISSING_FIELDS, INVALID_RECIPIENT, UNAUTHORIZED,
 *   THREAD_NOT_FOUND, GMAIL_RATE_LIMITED, GMAIL_SEND_FAILED
 */

import handler from '../../api/v1/messages';
import * as sendModule from '../../src/send/index';
import { signJwt } from '../../src/middleware/jwt';
import { ProviderError } from '../../src/types/provider';
import { mockReq, mockRes } from '../helpers/request';

jest.mock('../../src/send/index', () => ({
  sendMessage: jest.fn(),
}));

const mockSendMessage = jest.mocked(sendModule.sendMessage);

const FAKE_MESSAGE = {
  id:           'gmail_msg_001',
  userId:       'user-uuid-abc',
  createdAt:    new Date().toISOString(),
  updatedAt:    new Date().toISOString(),
  gmailId:      'gmail_msg_001',
  threadId:     'thread_001',
  labelIds:     ['SENT'],
  internalDate: '1700000000000',
  from:         'sender@example.com',
  to:           'recipient@example.com',
  subject:      'Test Subject',
  date:         new Date().toUTCString(),
  snippet:      'Hello world',
  bodyPlain:    'Hello world',
  bodyHtml:     null,
  isRead:       true,
  isStarred:    false,
  status:       'sent' as const,
  draftId:      null,
  attachments:  [],
};

const AUTH_HEADER = `Bearer ${signJwt({
  sub: 'user-uuid-abc', email: 'sender@example.com', name: 'Sender',
})}`;

beforeEach(() => {
  mockSendMessage.mockResolvedValue(FAKE_MESSAGE);
});

describe('POST /api/v1/messages', () => {

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('201 — returns the sent message with all CONTRACT.md §3 fields', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'recipient@example.com', subject: 'Test', body: 'Hello world' },
      }),
      res,
    );
    expect(state.statusCode).toBe(201);
    const { message } = state.body as { message: Record<string, unknown> };
    expect(message).toHaveProperty('id');
    expect(message).toHaveProperty('gmailId');
    expect(message).toHaveProperty('threadId');
    expect(message).toHaveProperty('labelIds');
    expect(message).toHaveProperty('from');
    expect(message).toHaveProperty('to');
    expect(message).toHaveProperty('isRead');
  });

  it('201 — passes all required fields to sendMessage', async () => {
    const { res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'Hi', body: 'Body text' },
      }),
      res,
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      'user-uuid-abc',
      expect.objectContaining({ to: 'r@example.com', subject: 'Hi', body: 'Body text' }),
    );
  });

  it('201 — passes optional threadId to sendMessage when provided', async () => {
    const { res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'Re', body: 'Reply', threadId: 'thread_xyz' },
      }),
      res,
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ threadId: 'thread_xyz' }),
    );
  });

  it('201 — omits threadId from sendMessage call when not provided', async () => {
    const { res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'New', body: 'New message' },
      }),
      res,
    );
    const callArgs = mockSendMessage.mock.calls[0][1];
    expect(callArgs.threadId).toBeUndefined();
  });

  // ── UNAUTHORIZED ───────────────────────────────────────────────────────────

  it('401 UNAUTHORIZED — no Authorization header', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', body: { to: 'r@example.com', subject: 's', body: 'b' } }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED — malformed Bearer token', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: 'Bearer invalid.token' },
        body:    { to: 'r@example.com', subject: 's', body: 'b' },
      }),
      res,
    );
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  // ── MISSING_FIELDS ─────────────────────────────────────────────────────────

  it('400 MISSING_FIELDS — to is absent', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('201 — subject is absent (optional, sends as "(no subject)")', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(201);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: '' }),
    );
  });

  it('201 — body is absent (optional)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'Test' },
      }),
      res,
    );
    expect(state.statusCode).toBe(201);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: '' }),
    );
  });

  it('201 — both subject and body absent (only to required)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com' },
      }),
      res,
    );
    expect(state.statusCode).toBe(201);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: '', body: '' }),
    );
  });

  it('400 MISSING_FIELDS — to is an empty string', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: '', subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('201 — subject is an empty string (allowed)', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: '', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(201);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: '' }),
    );
  });

  it('400 MISSING_FIELDS — a non-string value for to', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 123, subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  // ── INVALID_RECIPIENT ──────────────────────────────────────────────────────

  it('400 INVALID_RECIPIENT — no @ symbol', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'not-an-email', subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_RECIPIENT');
  });

  it('400 INVALID_RECIPIENT — missing domain part', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'user@', subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_RECIPIENT');
  });

  // ── THREAD_NOT_FOUND ───────────────────────────────────────────────────────

  it('404 THREAD_NOT_FOUND — sendMessage throws THREAD_NOT_FOUND', async () => {
    mockSendMessage.mockRejectedValue(
      new ProviderError('THREAD_NOT_FOUND', 'Thread not found in Gmail'),
    );
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'Re', body: 'Reply', threadId: 'nonexistent' },
      }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('THREAD_NOT_FOUND');
  });

  // ── GMAIL_RATE_LIMITED ─────────────────────────────────────────────────────

  it('429 GMAIL_RATE_LIMITED — sendMessage throws GMAIL_RATE_LIMITED', async () => {
    mockSendMessage.mockRejectedValue(
      new ProviderError('GMAIL_RATE_LIMITED', 'Gmail API quota exceeded'),
    );
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(429);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_RATE_LIMITED');
  });

  // ── GMAIL_SEND_FAILED ──────────────────────────────────────────────────────

  it('502 GMAIL_SEND_FAILED — sendMessage throws GMAIL_SEND_FAILED', async () => {
    mockSendMessage.mockRejectedValue(
      new ProviderError('GMAIL_SEND_FAILED', 'Gmail messages.send returned 500'),
    );
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method:  'POST',
        headers: { authorization: AUTH_HEADER },
        body:    { to: 'r@example.com', subject: 'Test', body: 'Hello' },
      }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_SEND_FAILED');
  });
});

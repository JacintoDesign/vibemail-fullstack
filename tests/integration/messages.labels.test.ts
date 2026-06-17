/**
 * Integration tests for POST/DELETE /api/v1/messages/:id/labels
 *
 * - Supabase is live (reads and writes are real)
 * - Gmail API (messages.modify) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 *
 * Covers: 405 guard, UNAUTHORIZED, INVALID_BODY (missing + protected label),
 * MESSAGE_NOT_FOUND, ALREADY_IN_STATE (add-present / remove-absent),
 * 200 add, 200 remove, and the Supabase label_ids write-through.
 */

import handler from '../../src/routes/messages/labels';
import * as authModule from '../../src/providers/gmail/auth';
import { signJwt } from '../../src/middleware/jwt';
import { seedUser, seedMessage, cleanupUser, getTestClient } from '../helpers/supabase';
import { mockReq, mockRes } from '../helpers/request';

jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  loadOAuth2Client: jest.fn(),
}));

jest.mock('googleapis', () => ({
  google: { gmail: jest.fn() },
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

describe('POST/DELETE /api/v1/messages/:id/labels', () => {
  it('405 — rejects unsupported methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST', query: { id: 'any' }, body: { labelId: 'CATEGORY_SOCIAL' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('400 INVALID_BODY — labelId missing', async () => {
    const msg = await seedMessage(testUserId);
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: {} }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('400 INVALID_BODY — refuses a protected (PATCH-owned) label', async () => {
    const msg = await seedMessage(testUserId);
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { labelId: 'STARRED' } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('INVALID_BODY');
    expect(mockModify).not.toHaveBeenCalled();
  });

  it('404 MESSAGE_NOT_FOUND — gmail_id does not exist', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: 'nope_lbl_000' }, body: { labelId: 'CATEGORY_SOCIAL' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('409 ALREADY_IN_STATE — add a label the message already has', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX', 'CATEGORY_SOCIAL'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { labelId: 'CATEGORY_SOCIAL' } }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  it('409 ALREADY_IN_STATE — remove a label the message does not have', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { labelId: 'CATEGORY_SOCIAL' } }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('ALREADY_IN_STATE');
  });

  it('200 — adds a label and writes label_ids through to Supabase', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { labelId: 'CATEGORY_UPDATES' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { message: { labelIds: string[] } };
    expect(body.message.labelIds).toContain('CATEGORY_UPDATES');
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ addLabelIds: ['CATEGORY_UPDATES'] }) }),
    );
    const { data } = await getTestClient().from('messages').select('label_ids').eq('gmail_id', msg.gmail_id).single();
    expect((data as { label_ids: string[] }).label_ids).toContain('CATEGORY_UPDATES');
  });

  it('200 — removes a label and writes label_ids through to Supabase', async () => {
    const msg = await seedMessage(testUserId, { label_ids: ['INBOX', 'CATEGORY_FORUMS'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id }, body: { labelId: 'CATEGORY_FORUMS' } }),
      res,
    );
    expect(state.statusCode).toBe(200);
    const body = state.body as { message: { labelIds: string[] } };
    expect(body.message.labelIds).not.toContain('CATEGORY_FORUMS');
    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ removeLabelIds: ['CATEGORY_FORUMS'] }) }),
    );
    const { data } = await getTestClient().from('messages').select('label_ids').eq('gmail_id', msg.gmail_id).single();
    expect((data as { label_ids: string[] }).label_ids).not.toContain('CATEGORY_FORUMS');
  });
});

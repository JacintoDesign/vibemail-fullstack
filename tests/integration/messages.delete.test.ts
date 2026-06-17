/**
 * Integration tests for DELETE /api/v1/messages/:id (non-draft hard delete)
 *
 * - Supabase is live (reads and the row deletion are real)
 * - Gmail API (messages.trash) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 *
 * Covers: UNAUTHORIZED, MESSAGE_NOT_FOUND, MESSAGE_IS_DRAFT (409),
 * 204 from Trash (no Gmail call), 204 from a non-trash folder (trashes first),
 * and MESSAGE_DELETE_FAILED when Gmail trash throws.
 */

import handler from '../../src/routes/messages/item';
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

const mockTrash = jest.fn();

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
  mockTrash.mockResolvedValue({ data: {} });
  (google.gmail as jest.Mock).mockReturnValue({
    users: { messages: { trash: mockTrash } },
  });
});

describe('DELETE /api/v1/messages/:id', () => {
  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'DELETE', query: { id: 'any' } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('404 MESSAGE_NOT_FOUND — gmail_id does not exist', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: 'nope_del_000' } }),
      res,
    );
    expect(state.statusCode).toBe(404);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('409 MESSAGE_IS_DRAFT — refuses to delete a draft here', async () => {
    const msg = await seedMessage(testUserId, { status: 'draft', draft_id: 'draft_xyz', label_ids: ['DRAFT'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(409);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_IS_DRAFT');
    expect(mockTrash).not.toHaveBeenCalled();
  });

  it('204 — deletes a trashed message without a redundant Gmail call', async () => {
    const msg = await seedMessage(testUserId, { status: 'trash', label_ids: ['TRASH'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(204);
    expect(mockTrash).not.toHaveBeenCalled();
    const { data } = await getTestClient().from('messages').select('id').eq('gmail_id', msg.gmail_id);
    expect((data ?? []).length).toBe(0);
  });

  it('204 — trashes a non-trash message in Gmail before dropping the row', async () => {
    const msg = await seedMessage(testUserId, { status: 'inbox', label_ids: ['INBOX'] });
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(204);
    expect(mockTrash).toHaveBeenCalledWith(expect.objectContaining({ id: msg.gmail_id }));
    const { data } = await getTestClient().from('messages').select('id').eq('gmail_id', msg.gmail_id);
    expect((data ?? []).length).toBe(0);
  });

  it('502 MESSAGE_DELETE_FAILED — Gmail trash throws; row is left intact', async () => {
    const msg = await seedMessage(testUserId, { status: 'inbox', label_ids: ['INBOX'] });
    mockTrash.mockRejectedValue(new Error('Gmail API 500'));
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'DELETE', headers: { authorization: authHeader }, query: { id: msg.gmail_id } }),
      res,
    );
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('MESSAGE_DELETE_FAILED');
    const { data } = await getTestClient().from('messages').select('id').eq('gmail_id', msg.gmail_id);
    expect((data ?? []).length).toBe(1);
  });
});

/**
 * Integration tests for GET /api/v1/labels
 *
 * - Gmail API (labels.list + labels.get) is mocked
 * - loadOAuth2Client is mocked to skip token decryption
 * - No Supabase access on this route
 *
 * Covers: 405 guard, UNAUTHORIZED, 200 (counts + shape),
 * GMAIL_RATE_LIMITED (429), GMAIL_LABELS_FAILED (other Gmail error).
 */

import handler from '../../api/v1/labels';
import * as authModule from '../../src/providers/gmail/auth';
import { signJwt } from '../../src/middleware/jwt';
import { mockReq, mockRes } from '../helpers/request';

jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  loadOAuth2Client: jest.fn(),
}));

jest.mock('googleapis', () => ({
  google: { gmail: jest.fn() },
}));

import { google } from 'googleapis';

const mockList = jest.fn();
const mockGet  = jest.fn();

const authHeader = `Bearer ${signJwt({ sub: 'user-123', email: 'u@example.com', name: 'U' })}`;

beforeEach(() => {
  (authModule.loadOAuth2Client as jest.Mock).mockResolvedValue({ fake: 'oauth2_client' });
  mockList.mockResolvedValue({
    data: {
      labels: [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'Label_42', name: 'Receipts', type: 'user' },
      ],
    },
  });
  mockGet.mockImplementation(({ id }: { id: string }) =>
    id === 'INBOX'
      ? { data: { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 100, messagesUnread: 7, threadsTotal: 90, threadsUnread: 5 } }
      : { data: { id: 'Label_42', name: 'Receipts', type: 'user', messagesTotal: 12, messagesUnread: 0, threadsTotal: 12, threadsUnread: 0, color: { backgroundColor: '#fff', textColor: '#000' } } },
  );
  (google.gmail as jest.Mock).mockReturnValue({
    users: { labels: { list: mockList, get: mockGet } },
  });
});

describe('GET /api/v1/labels', () => {
  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('401 UNAUTHORIZED — Authorization header absent', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('200 — returns each label with its counts', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: authHeader } }), res);
    expect(state.statusCode).toBe(200);
    const { labels } = state.body as { labels: Array<{ id: string; type: string; messagesUnread: number }> };
    expect(labels).toHaveLength(2);
    const inbox = labels.find((l) => l.id === 'INBOX')!;
    expect(inbox.messagesUnread).toBe(7);
    expect(inbox.type).toBe('system');
    const receipts = labels.find((l) => l.id === 'Label_42')!;
    expect(receipts.type).toBe('user');
    expect(receipts.messagesUnread).toBe(0);
  });

  it('429 GMAIL_RATE_LIMITED — surfaces a Gmail 429 from labels.list', async () => {
    mockList.mockRejectedValue(Object.assign(new Error('rate limited'), { code: 429 }));
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: authHeader } }), res);
    expect(state.statusCode).toBe(429);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_RATE_LIMITED');
  });

  it('502 GMAIL_LABELS_FAILED — other Gmail error from labels.get', async () => {
    mockGet.mockRejectedValue(new Error('Gmail API 500'));
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: authHeader } }), res);
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_LABELS_FAILED');
  });
});

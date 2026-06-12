import { signJwt } from '../../src/middleware/jwt';
import { mockReq, mockRes } from '../helpers/request';

// Mock the storage layer so the handler test stays off the network. A small MAX
// makes the size-limit path cheap to assert.
jest.mock('../../src/attachments/index', () => ({
  MAX_ATTACHMENT_BYTES: 100,
  createUpload: jest.fn(),
}));

import handler from '../../api/v1/attachments';
import * as attachments from '../../src/attachments/index';

const mockCreate = jest.mocked(attachments.createUpload);

const AUTH_HEADER = `Bearer ${signJwt({ sub: 'user-uuid-abc', email: 's@example.com', name: 'S' })}`;

describe('POST /api/v1/attachments', () => {
  it('405 — unsupported method (PUT)', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'PUT', headers: { authorization: AUTH_HEADER } }), res);
    expect(state.statusCode).toBe(405);
  });

  it('401 — missing Authorization header', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST', body: { filename: 'a.txt', size: 10 } }), res);
    expect(state.statusCode).toBe(401);
    expect((state.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('GET 401 — download requires auth', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', query: { messageId: 'm1', attachmentId: 'a1' } }), res);
    expect(state.statusCode).toBe(401);
  });

  it('GET 400 — download missing messageId / attachmentId', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET', headers: { authorization: AUTH_HEADER }, query: { messageId: 'm1' } }), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('400 — filename missing', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST', headers: { authorization: AUTH_HEADER }, body: { size: 10 } }), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('400 — size missing or non-positive', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: AUTH_HEADER }, body: { filename: 'a.txt', size: 0 } }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_FIELDS');
  });

  it('413 FILE_TOO_LARGE — declared size exceeds the limit', async () => {
    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', headers: { authorization: AUTH_HEADER }, body: { filename: 'big.bin', size: 200 } }),
      res,
    );
    expect(state.statusCode).toBe(413);
    expect((state.body as { error: { code: string } }).error.code).toBe('FILE_TOO_LARGE');
  });

  it('201 — returns the attachmentId and signed upload URL', async () => {
    mockCreate.mockResolvedValue({
      attachmentId: 'user-uuid-abc/uuid/report.pdf',
      uploadUrl: 'https://proj.supabase.co/storage/v1/object/upload/sign/attachments/...?token=abc',
    });
    const { state, res } = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        headers: { authorization: AUTH_HEADER },
        body: { filename: 'report.pdf', size: 42 },
      }),
      res,
    );
    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual({
      attachmentId: 'user-uuid-abc/uuid/report.pdf',
      uploadUrl: 'https://proj.supabase.co/storage/v1/object/upload/sign/attachments/...?token=abc',
    });
    expect(mockCreate).toHaveBeenCalledWith('user-uuid-abc', 'report.pdf');
  });
});

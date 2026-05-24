/**
 * Integration tests for the Vercel API entry point: api/webhook/gmail.ts
 *
 * processGmailNotification (src/webhook/gmail.ts) is mocked — this tests
 * only the HTTP contract of the webhook handler:
 *   - Method guard (405)
 *   - Acknowledge-first: HTTP 200 is sent BEFORE processing begins
 *   - processGmailNotification is called with the body and token from query
 *   - Errors from processGmailNotification are caught (200 already sent)
 */

import handler from '../../api/webhook/gmail';
import * as webhookModule from '../../src/webhook/gmail';
import { mockReq, mockRes } from '../helpers/request';

jest.mock('../../src/webhook/gmail', () => ({
  processGmailNotification: jest.fn(),
}));

const mockProcess = jest.mocked(webhookModule.processGmailNotification);

const VALID_PAYLOAD = {
  message: {
    data:        Buffer.from(JSON.stringify({ emailAddress: 'test@example.com', historyId: 12345 })).toString('base64'),
    messageId:   'msg-id-001',
    publishTime: new Date().toISOString(),
  },
  subscription: 'projects/test/subscriptions/vibemail-sub',
};

beforeEach(() => {
  mockProcess.mockResolvedValue();
});

describe('POST /webhook/gmail — API entry point', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects GET requests', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('405 — rejects DELETE requests', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'DELETE' }), res);
    expect(state.statusCode).toBe(405);
  });

  // ── Acknowledge-first pattern ──────────────────────────────────────────────

  it('sends HTTP 200 before processGmailNotification resolves (ack-first)', async () => {
    // processGmailNotification is a long-running promise that never resolves
    // until we manually release it — the handler must still return 200 immediately.
    let releaseProcess!: () => void;
    const processPending = new Promise<void>(resolve => { releaseProcess = resolve; });
    mockProcess.mockReturnValue(processPending);

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', query: { token: 'tok' }, body: VALID_PAYLOAD }),
      res,
    );

    // Handler has returned — 200 must already be sent
    expect(state.statusCode).toBe(200);
    expect(state.ended).toBe(true);

    // Release the pending process (cleanup)
    releaseProcess();
    await processPending;
  });

  // ── processGmailNotification invocation ───────────────────────────────────

  it('calls processGmailNotification with the request body', async () => {
    const { res } = mockRes();
    await handler(
      mockReq({ method: 'POST', query: { token: 'secret_token' }, body: VALID_PAYLOAD }),
      res,
    );

    // Allow the fire-and-forget promise to flush
    await new Promise(resolve => setImmediate(resolve));

    expect(mockProcess).toHaveBeenCalledWith(VALID_PAYLOAD, 'secret_token');
  });

  it('passes the token query param as the second argument', async () => {
    const { res } = mockRes();
    await handler(
      mockReq({ method: 'POST', query: { token: 'my_verification_token' }, body: {} }),
      res,
    );

    await new Promise(resolve => setImmediate(resolve));
    expect(mockProcess).toHaveBeenCalledWith(expect.anything(), 'my_verification_token');
  });

  it('passes empty string as token when token param is absent', async () => {
    const { res } = mockRes();
    await handler(mockReq({ method: 'POST', body: {} }), res);

    await new Promise(resolve => setImmediate(resolve));
    expect(mockProcess).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('still returns 200 even when processGmailNotification rejects', async () => {
    mockProcess.mockRejectedValue(new Error('processing blew up'));

    const { state, res } = mockRes();
    await handler(
      mockReq({ method: 'POST', query: { token: 'tok' }, body: VALID_PAYLOAD }),
      res,
    );

    // 200 was sent before the rejection — must still be 200
    expect(state.statusCode).toBe(200);
    expect(state.ended).toBe(true);

    // Let the rejected promise settle without crashing the test
    await new Promise(resolve => setImmediate(resolve));
  });
});

/**
 * Integration tests for GET /api/v1/auth/google/callback
 *
 * exchangeCode is mocked — this tests the HTTP contract of the callback
 * handler (status codes, redirect shape, JWT payload) without making real
 * Google OAuth calls or writing to Supabase.
 *
 * Covers every error.code listed in CONTRACT.md §4.1:
 *   302 (happy path), MISSING_CODE, OAUTH_DENIED,
 *   TOKEN_EXCHANGE_FAILED, GMAIL_UNAVAILABLE
 */

import jwt from 'jsonwebtoken';
import handler from '../../api/v1/auth/google/callback';
import * as authModule from '../../src/providers/gmail/auth';
import { ProviderError } from '../../src/types/provider';
import { mockReq, mockRes } from '../helpers/request';

// Mock only exchangeCode; leave encrypt/decrypt and all other auth helpers real.
jest.mock('../../src/providers/gmail/auth', () => ({
  ...jest.requireActual('../../src/providers/gmail/auth'),
  exchangeCode: jest.fn(),
}));

const mockExchangeCode = jest.mocked(authModule.exchangeCode);

const FAKE_TOKEN_RESULT = {
  accessToken:  'access_token_value',
  refreshToken: 'refresh_token_value',
  expiresAt:    Date.now() + 3_600_000,
  userId:       'supabase-uuid-abc123',
  email:        'test@example.com',
  name:         'Test User',
};

beforeEach(() => {
  process.env.FRONTEND_URL = 'http://localhost:3001';
});

describe('GET /api/v1/auth/google/callback', () => {

  // ── Method guard ───────────────────────────────────────────────────────────

  it('405 — rejects non-GET methods', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(state.statusCode).toBe(405);
    expect((state.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  // ── MISSING_CODE ───────────────────────────────────────────────────────────

  it('400 MISSING_CODE — no query params at all', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({}), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_CODE');
  });

  it('400 MISSING_CODE — code is an array (Vercel multi-value)', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: ['a', 'b'] } }), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('MISSING_CODE');
  });

  // ── OAUTH_DENIED ───────────────────────────────────────────────────────────

  it('400 OAUTH_DENIED — Google sends error=access_denied', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ query: { error: 'access_denied' } }), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('OAUTH_DENIED');
  });

  it('400 OAUTH_DENIED takes precedence over a missing code', async () => {
    const { state, res } = mockRes();
    await handler(mockReq({ query: { error: 'access_denied', code: 'present_but_irrelevant' } }), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: { code: string } }).error.code).toBe('OAUTH_DENIED');
  });

  // ── TOKEN_EXCHANGE_FAILED ──────────────────────────────────────────────────

  it('502 TOKEN_EXCHANGE_FAILED — exchangeCode throws ProviderError', async () => {
    mockExchangeCode.mockRejectedValue(
      new ProviderError('TOKEN_EXCHANGE_FAILED', 'Google rejected the authorization code'),
    );
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'bad_or_expired_code' } }), res);
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('TOKEN_EXCHANGE_FAILED');
  });

  it('502 TOKEN_EXCHANGE_FAILED — exchangeCode throws a generic non-ProviderError', async () => {
    mockExchangeCode.mockRejectedValue(new Error('unexpected network error'));
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'some_code' } }), res);
    expect(state.statusCode).toBe(502);
    expect((state.body as { error: { code: string } }).error.code).toBe('TOKEN_EXCHANGE_FAILED');
  });

  // ── GMAIL_UNAVAILABLE ──────────────────────────────────────────────────────

  it('503 GMAIL_UNAVAILABLE — ETIMEDOUT reaching Google', async () => {
    mockExchangeCode.mockRejectedValue(
      Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    );
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'slow_code' } }), res);
    expect(state.statusCode).toBe(503);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_UNAVAILABLE');
  });

  it('503 GMAIL_UNAVAILABLE — ECONNABORTED reaching Google', async () => {
    mockExchangeCode.mockRejectedValue(
      Object.assign(new Error('socket hang up'), { code: 'ECONNABORTED' }),
    );
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'slow_code' } }), res);
    expect(state.statusCode).toBe(503);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_UNAVAILABLE');
  });

  it('503 GMAIL_UNAVAILABLE — ENOTFOUND reaching Google', async () => {
    mockExchangeCode.mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    );
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'slow_code' } }), res);
    expect(state.statusCode).toBe(503);
    expect((state.body as { error: { code: string } }).error.code).toBe('GMAIL_UNAVAILABLE');
  });

  // ── Happy path: 302 redirect with JWT ─────────────────────────────────────

  it('302 — redirects to FRONTEND_URL/auth/callback?token=<jwt>', async () => {
    mockExchangeCode.mockResolvedValue(FAKE_TOKEN_RESULT);
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'valid_auth_code' } }), res);
    expect(state.statusCode).toBe(302);
    expect(state.location).toMatch(/^http:\/\/localhost:3001\/auth\/callback\?token=.+/);
  });

  it('302 — JWT payload contains sub (Supabase userId), email, and name', async () => {
    mockExchangeCode.mockResolvedValue(FAKE_TOKEN_RESULT);
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'valid_auth_code' } }), res);

    const token   = state.location!.split('token=')[1];
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded['sub']).toBe(FAKE_TOKEN_RESULT.userId);
    expect(decoded['email']).toBe(FAKE_TOKEN_RESULT.email);
    expect(decoded['name']).toBe(FAKE_TOKEN_RESULT.name);
  });

  it('302 — JWT exp is approximately 7 days from now', async () => {
    mockExchangeCode.mockResolvedValue(FAKE_TOKEN_RESULT);
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'valid_auth_code' } }), res);

    const token   = state.location!.split('token=')[1];
    const decoded = jwt.decode(token) as { exp: number };
    const sevenDaysFromNow = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    // Allow ±60 second tolerance
    expect(Math.abs(decoded.exp - sevenDaysFromNow)).toBeLessThan(60);
  });

  it('302 — the JWT is verifiable with JWT_SECRET', async () => {
    mockExchangeCode.mockResolvedValue(FAKE_TOKEN_RESULT);
    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'valid_auth_code' } }), res);

    const token  = state.location!.split('token=')[1];
    const secret = process.env.JWT_SECRET!;
    expect(() => jwt.verify(token, secret)).not.toThrow();
  });

  it('302 — passes the optional state param through to exchangeCode', async () => {
    mockExchangeCode.mockResolvedValue(FAKE_TOKEN_RESULT);
    const { res } = mockRes();
    await handler(mockReq({ query: { code: 'code', state: 'csrf_token_abc' } }), res);
    expect(mockExchangeCode).toHaveBeenCalledWith('code', 'csrf_token_abc');
  });

  it('500 CONFIG_ERROR — FRONTEND_URL env var is unset', async () => {
    mockExchangeCode.mockResolvedValue(FAKE_TOKEN_RESULT);
    const saved = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;

    const { state, res } = mockRes();
    await handler(mockReq({ query: { code: 'valid_auth_code' } }), res);
    expect(state.statusCode).toBe(500);

    process.env.FRONTEND_URL = saved; // restore
  });
});

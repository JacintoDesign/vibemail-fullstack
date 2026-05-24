/**
 * Unit tests for src/middleware/error.ts, src/middleware/jwt.ts, and
 * the AES-256-GCM helpers in src/providers/gmail/auth.ts.
 *
 * No Supabase, no Gmail API calls.
 *
 * Covers:
 *   errorResponse  — CONTRACT.md envelope shape
 *   handleError    — EVERY named error code → HTTP status from CONTRACT.md §4
 *   verifyJwt      — happy path, missing header, bad token, expired token
 *   signJwt        — payload round-trip
 *   encrypt/decrypt — AES-256-GCM round-trip, IV format, tamper detection
 */

import jwt from 'jsonwebtoken';
import { errorResponse, handleError } from '../../src/middleware/error';
import { verifyJwt, signJwt }         from '../../src/middleware/jwt';
import { encrypt, decrypt }            from '../../src/providers/gmail/auth';
import { ProviderError }               from '../../src/types/provider';
import { mockReq, mockRes }            from '../helpers/request';

// ── errorResponse ────────────────────────────────────────────────────────────

describe('errorResponse', () => {
  it('sends the CONTRACT.md error envelope with the correct HTTP status', () => {
    const { state, res } = mockRes();
    errorResponse(res, 404, 'NOT_FOUND', 'Resource not found');
    expect(state.statusCode).toBe(404);
    expect(state.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  it('includes details when provided', () => {
    const { state, res } = mockRes();
    errorResponse(res, 400, 'BAD_REQUEST', 'Invalid input', { field: 'email' });
    expect((state.body as { error: { details: unknown } }).error.details).toEqual({ field: 'email' });
  });

  it('omits the details key when no details are provided', () => {
    const { state, res } = mockRes();
    errorResponse(res, 400, 'BAD_REQUEST', 'Invalid input');
    expect((state.body as { error: Record<string, unknown> }).error).not.toHaveProperty('details');
  });
});

// ── handleError — all CONTRACT.md named error codes ──────────────────────────
//
// Verifies that every error.code listed in CONTRACT.md §4 maps to the
// documented HTTP status.  These cases are exercised here for codes that
// cannot be reached through the live endpoint handlers (e.g. SCOPE_MISSING,
// GMAIL_RATE_LIMITED) as well as for completeness.

describe('handleError — error code → HTTP status mapping', () => {
  const cases: Array<[string, number]> = [
    // 4xx
    ['UNAUTHORIZED',          401],
    ['SCOPE_MISSING',         403],
    ['USER_NOT_FOUND',        404],
    ['MESSAGE_NOT_FOUND',     404],
    ['THREAD_NOT_FOUND',      404],
    ['ALREADY_IN_STATE',      409],
    ['INVALID_LIMIT',         422],
    ['GMAIL_RATE_LIMITED',    429],
    // 5xx
    ['TOKEN_EXCHANGE_FAILED', 502],
    ['GMAIL_LIST_FAILED',     502],
    ['GMAIL_SEND_FAILED',     502],
    ['GMAIL_MODIFY_FAILED',   502],
    ['GMAIL_UNAVAILABLE',     503],
  ];

  test.each(cases)('ProviderError(%s) → HTTP %i', (code, expectedStatus) => {
    const { state, res } = mockRes();
    handleError(res, new ProviderError(code, `${code} error`));
    expect(state.statusCode).toBe(expectedStatus);
    expect((state.body as { error: { code: string } }).error.code).toBe(code);
  });

  it('maps an unknown ProviderError code to 500', () => {
    const { state, res } = mockRes();
    handleError(res, new ProviderError('UNRECOGNISED_CODE', 'unknown'));
    expect(state.statusCode).toBe(500);
  });

  it('maps a plain Error (non-ProviderError) to 500 INTERNAL_ERROR', () => {
    const { state, res } = mockRes();
    handleError(res, new Error('something exploded'));
    expect(state.statusCode).toBe(500);
    expect((state.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('does not leak the internal error message on unknown exceptions', () => {
    const { state, res } = mockRes();
    handleError(res, new Error('secret internal detail'));
    const body = state.body as { error: { message: string } };
    expect(body.error.message).not.toContain('secret internal detail');
  });
});

// ── verifyJwt ────────────────────────────────────────────────────────────────

describe('verifyJwt', () => {
  const payload = { sub: 'user-uuid-abc', email: 'test@example.com', name: 'Test User' };

  it('returns the decoded payload for a valid Bearer JWT', () => {
    const token = signJwt(payload);
    const req   = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const result = verifyJwt(req);
    expect(result.sub).toBe(payload.sub);
    expect(result.email).toBe(payload.email);
    expect(result.name).toBe(payload.name);
    expect(typeof result.exp).toBe('number');
  });

  it('throws UNAUTHORIZED when the Authorization header is absent', () => {
    expect(() => verifyJwt(mockReq({}))).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('throws UNAUTHORIZED when the header does not use the Bearer scheme', () => {
    const req = mockReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    expect(() => verifyJwt(req)).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('throws UNAUTHORIZED for a syntactically malformed token', () => {
    const req = mockReq({ headers: { authorization: 'Bearer not.a.jwt' } });
    expect(() => verifyJwt(req)).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('throws UNAUTHORIZED for an expired token', () => {
    const secret  = process.env.JWT_SECRET!;
    const expired = jwt.sign(
      { ...payload, exp: Math.floor(Date.now() / 1000) - 60 },
      secret,
    );
    const req = mockReq({ headers: { authorization: `Bearer ${expired}` } });
    expect(() => verifyJwt(req)).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('throws UNAUTHORIZED for a token signed with a different secret', () => {
    const forged = jwt.sign(payload, 'wrong_secret', { expiresIn: '7d' });
    const req    = mockReq({ headers: { authorization: `Bearer ${forged}` } });
    expect(() => verifyJwt(req)).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });
});

// ── AES-256-GCM encrypt / decrypt ────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  it('roundtrips a plaintext string', () => {
    const plaintext = 'ya29.a0fake_access_token_value';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces a different ciphertext on each call (random IV)', () => {
    const a = encrypt('same_input');
    const b = encrypt('same_input');
    expect(a).not.toBe(b);
  });

  it('produces the iv:authTag:ciphertext format (exactly two colons)', () => {
    const parts = encrypt('test_value').split(':');
    expect(parts).toHaveLength(3);
    // 12-byte IV  → 24 hex characters
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/i);
    // 16-byte GCM auth tag → 32 hex characters
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/i);
  });

  it('throws DECRYPTION_FAILED for a malformed ciphertext (wrong number of parts)', () => {
    expect(() => decrypt('not-valid-at-all')).toThrow(
      expect.objectContaining({ code: 'DECRYPTION_FAILED' }),
    );
  });

  it('throws when the ciphertext data segment is tampered (GCM auth tag failure)', () => {
    const enc    = encrypt('original_value');
    const parts  = enc.split(':');
    // Flip the first byte of the ciphertext
    const tampered = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('handles empty string roundtrip', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('handles unicode content roundtrip', () => {
    const text = '🔐 OAuth token: 日本語テスト';
    expect(decrypt(encrypt(text))).toBe(text);
  });
});

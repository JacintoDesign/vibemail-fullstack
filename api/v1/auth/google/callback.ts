import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCode } from '../../../../src/providers/gmail/auth';
import { signJwt } from '../../../../src/middleware/jwt';
import { errorResponse } from '../../../../src/middleware/error';
import { ProviderError } from '../../../../src/types/provider';

/**
 * GET /api/v1/auth/google/callback
 *
 * Receives the authorization code from Google, exchanges it for tokens,
 * issues a signed JWT, and redirects to FRONTEND_URL/auth/callback?token=<jwt>.
 *
 * Unauthenticated — no Bearer token required.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  const { code, state, error: oauthError } = req.query;

  // Google sends error=access_denied when the user clicks Deny.
  if (oauthError === 'access_denied') {
    errorResponse(res, 400, 'OAUTH_DENIED', 'User denied the OAuth consent request');
    return;
  }

  if (!code || typeof code !== 'string') {
    errorResponse(res, 400, 'MISSING_CODE', 'Required query parameter "code" is absent');
    return;
  }

  const stateParam = typeof state === 'string' ? state : undefined;

  try {
    const { userId, email, name } = await exchangeCode(code, stateParam);

    const token = signJwt({ sub: userId, email, name });

    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      errorResponse(res, 500, 'CONFIG_ERROR', 'FRONTEND_URL env var is not set');
      return;
    }

    res.redirect(302, `${frontendUrl}/auth/callback?token=${token}`);
  } catch (err) {
    if (err instanceof ProviderError) {
      if (err.code === 'TOKEN_EXCHANGE_FAILED') {
        errorResponse(res, 502, err.code, err.message);
        return;
      }
      if (err.code === 'CONFIG_ERROR') {
        errorResponse(res, 500, err.code, err.message);
        return;
      }
    }
    // Network timeout reaching Google
    if (isTimeoutError(err)) {
      errorResponse(res, 503, 'GMAIL_UNAVAILABLE', 'Timed out reaching Google APIs');
      return;
    }
    errorResponse(res, 502, 'TOKEN_EXCHANGE_FAILED', 'OAuth token exchange failed');
  }
}

function isTimeoutError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as Record<string, unknown>).code;
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

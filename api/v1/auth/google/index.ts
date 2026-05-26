import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initiateOAuth } from '../../../../src/providers/gmail/auth';
import { errorResponse } from '../../../../src/middleware/error';
import { ProviderError } from '../../../../src/types/provider';

/**
 * GET /api/v1/auth/google
 *
 * Generates the Google OAuth2 consent URL and redirects the user to it.
 * The state token returned by initiateOAuth is embedded in the URL by the
 * googleapis client and echoed back by Google in the callback query string.
 *
 * Unauthenticated — no Bearer token required.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  try {
    const { url } = await initiateOAuth();
    res.redirect(302, url);
  } catch (err) {
    if (err instanceof ProviderError && err.code === 'CONFIG_ERROR') {
      errorResponse(res, 500, err.code, err.message);
      return;
    }
    errorResponse(res, 500, 'CONFIG_ERROR', 'OAuth initiation failed due to a configuration error');
  }
}

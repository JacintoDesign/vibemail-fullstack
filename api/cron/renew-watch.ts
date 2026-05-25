import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorResponse, handleError } from '../../src/middleware/error';
import { renewExpiringWatches } from '../../src/cron/renewWatch';

/**
 * GET /api/cron/renew-watch
 *
 * Vercel Cron Job — runs daily at 06:00 UTC (configured in vercel.json).
 * Renews Gmail push-notification watches that are within 24 hours of expiry.
 *
 * Authentication: verified via CRON_SECRET env var. Vercel automatically
 * sends `Authorization: Bearer <CRON_SECRET>` when invoking cron functions;
 * set CRON_SECRET in your Vercel project environment variables.
 *
 * Response: { renewed: number; failed: number }
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  // ── Cron secret verification ──────────────────────────────────────────────
  // Skip check when CRON_SECRET is unset (local dev without vercel dev tooling).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${cronSecret}`) {
      errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid or missing cron secret');
      return;
    }
  }

  // ── Run renewal batch ─────────────────────────────────────────────────────
  try {
    const { renewed, failed } = await renewExpiringWatches();
    res.status(200).json({ renewed, failed });
  } catch (err) {
    handleError(res, err);
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from '../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../src/middleware/error';
import { runBackfill } from '../../../src/sync/index';

/**
 * POST /api/v1/sync/backfill — resumable, capped backfill of older INBOX
 * history beyond the initial 50-message seed sync.
 *
 * Requires Authorization: Bearer <jwt>.
 *
 * Query/body params:
 *   max?    — overall cap on this run (integer 1..5000, default 500)
 *   cursor? — opaque resume cursor returned by a prior call
 *
 * Each call processes one batch and returns:
 *   { synced, syncedThisCall, done, nextCursor }
 *
 * The caller loops, passing nextCursor back as cursor, until done === true.
 * Backfill is idempotent (upsert on gmail_id), so overlapping the initial
 * sync's rows is safe.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted on this endpoint');
    return;
  }

  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  // Accept params from either the query string or a JSON body.
  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const rawMax    = req.query.max    ?? body.max;
  const rawCursor = req.query.cursor ?? body.cursor;

  let max = 500;
  if (rawMax !== undefined) {
    max = Number(rawMax);
    if (!Number.isInteger(max) || max < 1 || max > 5000) {
      errorResponse(res, 422, 'INVALID_LIMIT', 'max must be an integer between 1 and 5000');
      return;
    }
  }

  let cursor: string | undefined;
  if (rawCursor !== undefined) {
    if (typeof rawCursor !== 'string') {
      errorResponse(res, 422, 'INVALID_LIMIT', 'cursor must be a string');
      return;
    }
    cursor = rawCursor;
  }

  try {
    const result = await runBackfill(payload.sub, { max, cursor });
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err);
  }
}

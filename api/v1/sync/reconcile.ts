import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from '../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../src/middleware/error';
import { reconcileInbox } from '../../../src/sync/index';

/**
 * POST /api/v1/sync/reconcile — drop stale INBOX labels.
 *
 * Requires Authorization: Bearer <jwt>.
 *
 * Compares our stored inbox against Gmail's live inbox and strips the INBOX
 * label from rows Gmail no longer lists as inbox (archived/trashed/deleted),
 * so the inbox count converges to Gmail's. Self-sent mail (SENT + INBOX) is
 * preserved. Cheap — it lists message ids only, no full-message fetches.
 *
 * Returns: { inboxCount, removed, removedGmailIds }
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

  try {
    const result = await reconcileInbox(payload.sub);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err);
  }
}

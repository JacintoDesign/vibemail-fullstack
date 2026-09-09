import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from '../../middleware/jwt';
import { errorResponse, handleError } from '../../middleware/error';
import { digestFromMessages, messagesForDigest } from '../../memory/digest';

/**
 * GET /api/v1/messages/digest
 *
 * Wider retrieval than search, then a grounded brief. Empty retrieval never
 * calls the model. Quota/unavailability lists the matching newsletters
 * instead of failing (MEMORY_CONTRACT.md §5).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim() === '') {
    errorResponse(res, 400, 'MISSING_QUERY', 'Query parameter "q" is required and must not be empty');
    return;
  }

  try {
    const topic = q.trim();
    const messages = await messagesForDigest(payload.sub, topic);

    if (messages.length === 0) {
      res.status(200).json({
        messages,
        nextCursor: null,
        digest: null,
        reasonUnavailable: false,
      });
      return;
    }

    const brief = await digestFromMessages(topic, messages);
    res.status(200).json({
      messages,
      nextCursor: null,
      digest: brief.text,
      reasonUnavailable: brief.unavailable,
    });
  } catch (err) {
    handleError(res, err);
  }
}

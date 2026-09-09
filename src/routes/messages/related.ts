import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from '../../middleware/jwt';
import { errorResponse, handleError } from '../../middleware/error';
import { relatedMessages } from '../../memory/related';

/**
 * GET /api/v1/messages/:id/related
 *
 * Neighbors of this message by its stored embedding. Does not embed. Does not
 * filter or boost by sender. The open message is omitted. Empty list when
 * nothing else clears MATCH_THRESHOLD — the client hides the panel.
 *
 * `:id` is the Gmail message id (gmailId), same as GET /messages/:id.
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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'Message ID is required in the URL path');
    return;
  }

  try {
    const messages = await relatedMessages(payload.sub, id);
    res.status(200).json({ messages });
  } catch (err) {
    handleError(res, err);
  }
}

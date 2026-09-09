import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from '../../middleware/jwt';
import { errorResponse, handleError } from '../../middleware/error';
import { searchByMeaning } from '../../memory/retrieve';
import { searchByKeyword } from '../../memory/keywordSearch';
import { needsReasoning } from '../../memory/needsReasoning';
import { answerFromMessages } from '../../memory/answerFromMessages';

/**
 * GET /api/v1/messages/semantic
 *
 * Embeds the query and returns nearest messages that clear MATCH_THRESHOLD.
 * If nothing clears it, fall back to keyword search and never attach an
 * answer (MEMORY_CONTRACT.md §5). Questions over strong semantic hits may
 * get a grounded summary; quota/unavailability still returns the list.
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
    const query = q.trim();
    const semanticHits = await searchByMeaning(payload.sub, query);

    if (semanticHits.length === 0) {
      const messages = await searchByKeyword(payload.sub, query);
      res.status(200).json({
        messages,
        nextCursor: null,
        answer: null,
        reasonUnavailable: false,
        source: 'keyword',
      });
      return;
    }

    let answer: string | null = null;
    let reasonUnavailable = false;
    if (needsReasoning(query)) {
      const grounded = await answerFromMessages(query, semanticHits);
      answer = grounded.text;
      reasonUnavailable = grounded.unavailable;
    }

    res.status(200).json({
      messages: semanticHits,
      nextCursor: null,
      answer,
      reasonUnavailable,
      source: 'semantic',
    });
  } catch (err) {
    handleError(res, err);
  }
}

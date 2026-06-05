import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../src/middleware/error';
import { ProviderError } from '../../../src/types/provider';
import { rowToMessage, DbMessageRow } from '../../../src/sync/normalize';

/**
 * GET /api/v1/messages/search
 *
 * Returns messages matching a search query against subject, from, snippet,
 * and to fields (case-insensitive substring match). Uses the same
 * cursor-based pagination as GET /api/v1/messages.
 *
 * CONTRACT.md §4.7
 *
 * NOTE: Vercel resolves static file paths before dynamic [id] routes, so
 * this file takes precedence over messages/[id].ts for /api/v1/messages/search.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  // ── Query param validation ────────────────────────────────────────────────
  const { q, cursor, limit: limitParam } = req.query;

  if (!q || typeof q !== 'string' || q.trim() === '') {
    errorResponse(res, 400, 'MISSING_QUERY', 'Query parameter "q" is required and must not be empty');
    return;
  }

  const limit = limitParam === undefined ? 20 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errorResponse(res, 422, 'INVALID_LIMIT', 'limit must be an integer between 1 and 100');
    return;
  }

  const supabase = getSupabase();
  const searchTerm = `%${q.trim()}%`;

  try {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('user_id', payload.sub)
      .or(
        `subject.ilike.${searchTerm},from_address.ilike.${searchTerm},snippet.ilike.${searchTerm},to_address.ilike.${searchTerm}`,
      )
      .order('created_at', { ascending: false })
      .order('gmail_id',   { ascending: false })
      .limit(limit + 1);

    // Cursor-based pagination — same encoding as GET /api/v1/messages.
    if (cursor && typeof cursor === 'string') {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const { d: cursorDate, g: cursorGmailId } = JSON.parse(raw) as { d: string; g: string };
      query = query.or(
        `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},gmail_id.lt.${cursorGmailId})`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new ProviderError('GMAIL_LIST_FAILED', error.message, error);
    }

    const rows    = (data ?? []) as DbMessageRow[];
    const hasMore = rows.length > limit;
    const page    = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({
          d: page[page.length - 1].created_at,
          g: page[page.length - 1].gmail_id,
        })).toString('base64')
      : null;

    res.status(200).json({
      messages:   page.map(rowToMessage),
      nextCursor,
    });
  } catch (err) {
    handleError(res, err);
  }
}

// ── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ProviderError('CONFIG_ERROR', 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key);
}

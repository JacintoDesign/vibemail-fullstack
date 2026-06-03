import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../src/middleware/jwt';
import { errorResponse, handleError } from '../../src/middleware/error';
import { ProviderError } from '../../src/types/provider';
import { sendMessage } from '../../src/send/index';
import { rowToMessage, DbMessageRow } from '../../src/sync/normalize';

/**
 * GET  /api/v1/messages — paginated message list from Supabase
 * POST /api/v1/messages — compose and send a message via Gmail
 *
 * Both routes require Authorization: Bearer <jwt>.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleSend(req, res);
  errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are accepted on this endpoint');
}

// ── GET /api/v1/messages ─────────────────────────────────────────────────────

async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const { cursor, limit: limitParam, labelId } = req.query;

  // Validate limit
  const limit = limitParam === undefined ? 20 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errorResponse(res, 422, 'INVALID_LIMIT', 'limit must be an integer between 1 and 100');
    return;
  }

  const supabase = getSupabase();

  try {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('user_id', payload.sub)
      .order('created_at', { ascending: false })
      .order('gmail_id',   { ascending: false })  // stable tiebreaker within same ms
      .limit(limit + 1); // fetch one extra to determine if there's a next page

    // Cursor is a base64-encoded JSON payload: { d: created_at, g: gmail_id }.
    // The compound filter ensures stable keyset pagination even when multiple
    // messages share the same internalDate (created_at).
    if (cursor && typeof cursor === 'string') {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const { d: cursorDate, g: cursorGmailId } = JSON.parse(raw) as { d: string; g: string };
      query = query.or(
        `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},gmail_id.lt.${cursorGmailId})`,
      );
    }

    // Filter by label if provided.
    if (labelId && typeof labelId === 'string') {
      query = query.contains('label_ids', [labelId]);
    }

    const { data, error } = await query;

    if (error) {
      throw new ProviderError('GMAIL_LIST_FAILED', error.message, error);
    }

    const rows = (data ?? []) as DbMessageRow[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const messages = page.map(rowToMessage);

    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({
          d: page[page.length - 1].created_at,
          g: page[page.length - 1].gmail_id,
        })).toString('base64')
      : null;

    res.status(200).json({ messages, nextCursor });
  } catch (err) {
    handleError(res, err);
  }
}

// ── POST /api/v1/messages ────────────────────────────────────────────────────

async function handleSend(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const body = req.body as Record<string, unknown>;
  const { to, subject, body: msgBody, threadId } = body ?? {};

  // Validate required fields.
  if (!to || !subject || !msgBody) {
    errorResponse(
      res, 400, 'MISSING_FIELDS',
      'Request body must include to, subject, and body',
    );
    return;
  }

  if (typeof to !== 'string' || typeof subject !== 'string' || typeof msgBody !== 'string') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'to, subject, and body must be strings');
    return;
  }

  // Basic RFC 5321 email validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    errorResponse(res, 400, 'INVALID_RECIPIENT', 'to must be a valid email address');
    return;
  }

  if (to.trim() === '' || subject.trim() === '' || msgBody.trim() === '') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'to, subject, and body must not be empty strings');
    return;
  }

  try {
    const message = await sendMessage(payload.sub, {
      to,
      subject,
      body: msgBody,
      threadId: typeof threadId === 'string' ? threadId : undefined,
    });

    res.status(201).json({ message });
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

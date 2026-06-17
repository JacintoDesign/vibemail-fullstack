import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../middleware/jwt';
import { errorResponse, handleError } from '../../middleware/error';
import { ProviderError } from '../../types/provider';
import { loadOAuth2Client } from '../../providers/gmail/auth';
import { normalizeMessage } from '../../sync/normalize';
import type { Message } from '../../types/message';

/**
 * POST /api/v1/drafts
 *
 * Creates a Gmail draft via the Gmail drafts API and persists it in Supabase
 * with status = 'draft'. Supports both new drafts and draft replies.
 *
 * CONTRACT.md §4.8
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted on this endpoint');
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

  // ── Body validation ───────────────────────────────────────────────────────
  const body = req.body as Record<string, unknown> ?? {};
  const { to, subject, body: msgBody, threadId } = body;

  // Subject and body are optional — an empty/absent subject sends as
  // "(no subject)", and an empty body is allowed too (both match Gmail).
  // Default them to empty strings. Only `to` is required.
  const subjectStr = subject === undefined || subject === null ? '' : subject;
  const bodyStr    = msgBody === undefined || msgBody === null ? '' : msgBody;

  if (!to) {
    errorResponse(res, 400, 'MISSING_FIELDS', 'Request body must include to');
    return;
  }
  if (typeof to !== 'string' || typeof bodyStr !== 'string' || typeof subjectStr !== 'string') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'to must be a string; subject and body, if present, must be strings');
    return;
  }
  if (to.trim() === '') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'to must not be an empty string');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    errorResponse(res, 400, 'INVALID_RECIPIENT', 'to must be a valid email address');
    return;
  }

  try {
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    // Fetch sender address for the RFC 2822 From header.
    const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
    const from = profile.emailAddress;
    if (!from) {
      throw new ProviderError('GMAIL_DRAFT_FAILED', 'Could not retrieve sender email address from Gmail profile');
    }

    // Build RFC 2822 raw message.
    const raw = buildRaw(from, { to, subject: subjectStr, body: bodyStr });

    // Create the draft via Gmail drafts API.
    let draftId:   string;
    let gmailMsgId: string;

    try {
      const { data: draft } = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw,
            ...(typeof threadId === 'string' ? { threadId } : {}),
          },
        },
      });

      if (!draft.id || !draft.message?.id) {
        throw new ProviderError('GMAIL_DRAFT_FAILED', 'Gmail did not return draft ID or message ID');
      }

      draftId    = draft.id;
      gmailMsgId = draft.message.id;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError('GMAIL_DRAFT_FAILED', 'Gmail drafts.create failed', err);
    }

    // Fetch the full draft message so we can normalize it to the Message shape.
    const { data: fullMsg } = await gmail.users.messages.get({
      userId: 'me',
      id:     gmailMsgId,
      format: 'FULL',
    });

    const normalized = normalizeMessage(fullMsg, payload.sub, draftId);

    // Persist to Supabase.
    const supabase = getSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertRow: any = {
      user_id:      normalized.userId,
      gmail_id:     normalized.gmailId,
      thread_id:    normalized.threadId,
      label_ids:    normalized.labelIds,
      from_address: normalized.from,
      to_address:   normalized.to,
      subject:      normalized.subject,
      date:         normalized.date,
      snippet:      normalized.snippet,
      body_plain:   normalized.bodyPlain,
      body_html:    normalized.bodyHtml,
      is_read:      normalized.isRead,
      is_starred:   normalized.isStarred,
      status:       normalized.status,
      draft_id:     draftId,
      created_at:   new Date(Number(normalized.internalDate) || Date.now()).toISOString(),
    };

    const { error: dbError } = await supabase
      .from('messages')
      .upsert(insertRow, { onConflict: 'gmail_id' });

    if (dbError) {
      throw new ProviderError('GMAIL_DRAFT_FAILED', dbError.message, dbError);
    }

    const message: Message = {
      ...normalized,
      id:        gmailMsgId,
      createdAt: insertRow.created_at,
      updatedAt: insertRow.created_at,
    };

    res.status(201).json({ message });
  } catch (err) {
    handleError(res, err);
  }
}

// ── RFC 2822 ──────────────────────────────────────────────────────────────────

function buildRaw(
  from: string,
  options: { to: string; subject: string; body: string },
): string {
  const headers = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ].join('\r\n');

  return Buffer.from(`${headers}\r\n\r\n${options.body}`).toString('base64url');
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

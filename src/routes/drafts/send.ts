import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../middleware/jwt';
import { errorResponse, handleError } from '../../middleware/error';
import { ProviderError } from '../../types/provider';
import { loadOAuth2Client } from '../../providers/gmail/auth';
import { resolveDraftId, isGmailNotFound } from '../../providers/gmail/drafts';
import { normalizeMessage, rowToMessage, DbMessageRow } from '../../sync/normalize';

/**
 * POST /api/v1/drafts/:id/send
 *
 * Sends an existing Gmail draft via drafts.send and transitions the Supabase
 * row: clears draftId, updates gmailId to the new sent message ID, and sets
 * status = 'sent'.
 *
 * `:id` is the Supabase messages.id (= Gmail messageId of the draft, NOT the draftId).
 *
 * CONTRACT.md §4.11
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

  // ── Path param ────────────────────────────────────────────────────────────
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'Draft message ID is required in the URL path');
    return;
  }

  const supabase = getSupabase();

  try {
    // ── Fetch current draft row ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draftQuery = (supabase.from('messages').select('*').eq('gmail_id', id).eq('user_id', payload.sub) as any)
      .eq('status', 'draft')
      .single();
    const { data, error: fetchError } = await draftQuery;

    if (fetchError || !data) {
      throw new ProviderError('DRAFT_NOT_FOUND', `No draft with id "${id}" found for this user`);
    }

    const row = data as DbMessageRow & { draft_id: string | null };

    // ── Send the draft via Gmail ──────────────────────────────────────────
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    // Prefer the persisted draft_id; fall back to a live lookup for drafts that
    // were synced via the webhook and never had draft_id written.
    const draftId = row.draft_id ?? await resolveDraftId(gmail, row.gmail_id);
    if (!draftId) {
      throw new ProviderError('DRAFT_NOT_FOUND', `Could not resolve a Gmail draft id for message "${id}"`);
    }

    let sentGmailId: string;

    try {
      const { data: sent } = await gmail.users.drafts.send({
        userId:      'me',
        requestBody: { id: draftId },
      });

      if (!sent.id) {
        throw new ProviderError('GMAIL_DRAFT_FAILED', 'Gmail did not return a message ID after drafts.send');
      }

      sentGmailId = sent.id;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      // The draft was deleted in Gmail since we synced the row — it can't be
      // sent. Surface a clean 404 so the client can drop the stale row.
      if (isGmailNotFound(err)) {
        throw new ProviderError('DRAFT_NOT_FOUND', `Draft for message "${id}" no longer exists in Gmail`);
      }
      throw new ProviderError('GMAIL_DRAFT_FAILED', 'Gmail drafts.send failed', err);
    }

    // ── Fetch the full sent message to normalize ──────────────────────────
    const { data: fullMsg } = await gmail.users.messages.get({
      userId: 'me',
      id:     sentGmailId,
      format: 'FULL',
    });

    const normalized = normalizeMessage(fullMsg, payload.sub, null);

    // ── Transition the Supabase row ───────────────────────────────────────
    // Three changes per CONTRACT.md §3 and §4.11:
    //   - gmail_id  → new sent message ID (drafts.send creates a new message)
    //   - draft_id  → null
    //   - status    → 'sent'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {
      gmail_id:   sentGmailId,
      draft_id:   null,
      status:     'sent',
      label_ids:  normalized.labelIds,
      is_read:    normalized.isRead,
      is_starred: normalized.isStarred,
      snippet:    normalized.snippet,
      body_plain: normalized.bodyPlain,
      body_html:  normalized.bodyHtml,
    };

    const { error: updateError } = await supabase
      .from('messages')
      .update(updatePayload)
      .eq('gmail_id', id)          // match on the old draft message ID
      .eq('user_id', payload.sub);

    if (updateError) {
      throw new ProviderError('GMAIL_DRAFT_FAILED', updateError.message, updateError);
    }

    // Build the response from the updated row shape.
    const updatedRow: DbMessageRow = {
      ...row,
      gmail_id:   sentGmailId,
      draft_id:   null,
      status:     'sent',
      label_ids:  normalized.labelIds,
      is_read:    normalized.isRead,
      is_starred: normalized.isStarred,
      snippet:    normalized.snippet,
      body_plain: normalized.bodyPlain,
      body_html:  normalized.bodyHtml,
      updated_at: new Date().toISOString(),
    };

    res.status(200).json({ message: rowToMessage(updatedRow) });
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

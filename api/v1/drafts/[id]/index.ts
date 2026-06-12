import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../../../../src/middleware/jwt';
import { errorResponse, handleError } from '../../../../src/middleware/error';
import { ProviderError } from '../../../../src/types/provider';
import { loadOAuth2Client } from '../../../../src/providers/gmail/auth';
import { resolveDraftId, isGmailNotFound } from '../../../../src/providers/gmail/drafts';
import { rowToMessage, DbMessageRow } from '../../../../src/sync/normalize';

/**
 * PATCH  /api/v1/drafts/:id — update draft content
 * DELETE /api/v1/drafts/:id — delete draft (Gmail + Supabase, atomic)
 *
 * `:id` is the Supabase messages.id (= Gmail messageId, NOT the draftId).
 * The handler reads draftId from Supabase to call the Gmail drafts API.
 *
 * CONTRACT.md §4.9, §4.10
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'PATCH')  return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only PATCH and DELETE are accepted on this endpoint');
}

// ── PATCH /api/v1/drafts/:id ─────────────────────────────────────────────────

async function handleUpdate(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'Draft message ID is required in the URL path');
    return;
  }

  const body = req.body as Record<string, unknown> ?? {};
  const { to, subject, body: msgBody } = body;

  const hasTo      = to      !== undefined;
  const hasSubject = subject !== undefined;
  const hasBody    = msgBody !== undefined;

  if (!hasTo && !hasSubject && !hasBody) {
    errorResponse(res, 400, 'INVALID_BODY', 'Body must include at least one of: to, subject, body');
    return;
  }
  if (hasTo      && typeof to      !== 'string') { errorResponse(res, 400, 'INVALID_BODY', '"to" must be a string'); return; }
  if (hasSubject && typeof subject !== 'string') { errorResponse(res, 400, 'INVALID_BODY', '"subject" must be a string'); return; }
  if (hasBody    && typeof msgBody !== 'string') { errorResponse(res, 400, 'INVALID_BODY', '"body" must be a string'); return; }
  if (hasTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to as string)) {
    errorResponse(res, 400, 'INVALID_RECIPIENT', 'to must be a valid email address');
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

    // ── Build the updated RFC 2822 message ────────────────────────────────
    const newTo      = hasTo      ? (to      as string) : row.to_address;
    const newSubject = hasSubject ? (subject as string) : row.subject;
    const newBody    = hasBody    ? (msgBody as string) : (row.body_plain ?? '');

    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    // Prefer the persisted draft_id; fall back to a live lookup for drafts that
    // were synced via the webhook and never had draft_id written.
    const draftId = row.draft_id ?? await resolveDraftId(gmail, row.gmail_id);
    if (!draftId) {
      throw new ProviderError('DRAFT_NOT_FOUND', `Could not resolve a Gmail draft id for message "${id}"`);
    }

    const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
    const from = profile.emailAddress ?? row.from_address;

    const raw = buildRaw(from, { to: newTo, subject: newSubject, body: newBody });

    // ── Update via Gmail drafts API ───────────────────────────────────────
    // Gmail creates a NEW underlying message ID on every drafts.update call.
    // We must capture that ID and write it to Supabase so the old row is
    // updated in-place. Without this, the Pub/Sub webhook fires for the new
    // message ID and inserts a duplicate row.
    let newGmailMsgId: string = row.gmail_id;
    try {
      const { data: updatedDraft } = await gmail.users.drafts.update({
        userId:  'me',
        id:      draftId,
        requestBody: {
          message: { raw },
        },
      });
      // drafts.update response always contains the new message ID.
      newGmailMsgId = updatedDraft.message?.id ?? row.gmail_id;
    } catch (err) {
      // The draft was deleted in Gmail since we synced the row — it can't be
      // edited. Surface a clean 404 so the client can drop the stale row
      // (and offer Delete, which force-removes it).
      if (isGmailNotFound(err)) {
        throw new ProviderError('DRAFT_NOT_FOUND', `Draft for message "${id}" no longer exists in Gmail`);
      }
      throw new ProviderError('GMAIL_DRAFT_FAILED', 'Gmail drafts.update failed', err);
    }

    // ── Update Supabase ───────────────────────────────────────────────────
    // Include gmail_id so the row's primary Gmail key stays in sync with the
    // new message ID Gmail assigned. Filter by the OLD gmail_id (path param).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {
      gmail_id:   newGmailMsgId,
      to_address: newTo,
      subject:    newSubject,
      body_plain: newBody,
      // Self-heal: persist the resolved draft id so a webhook-synced draft
      // (which had draft_id = null) stops needing the live Gmail lookup.
      draft_id:   draftId,
    };

    const { error: updateError } = await supabase
      .from('messages')
      .update(updatePayload)
      .eq('gmail_id', id)          // match on OLD gmail_id
      .eq('user_id', payload.sub);

    if (updateError) {
      throw new ProviderError('GMAIL_DRAFT_FAILED', updateError.message, updateError);
    }

    // Return the updated message shape (with the new gmail_id reflected).
    const updated: DbMessageRow = {
      ...row,
      gmail_id:   newGmailMsgId,
      to_address: newTo,
      subject:    newSubject,
      body_plain: newBody,
      updated_at: new Date().toISOString(),
    };

    res.status(200).json({ message: rowToMessage(updated) });
  } catch (err) {
    handleError(res, err);
  }
}

// ── DELETE /api/v1/drafts/:id ─────────────────────────────────────────────────

async function handleDelete(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    errorResponse(res, 400, 'INVALID_BODY', 'Draft message ID is required in the URL path');
    return;
  }

  const supabase = getSupabase();

  try {
    // ── Fetch draft row to get draftId ────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deleteQuery = (supabase.from('messages').select('gmail_id, draft_id').eq('gmail_id', id).eq('user_id', payload.sub) as any)
      .eq('status', 'draft')
      .single();
    const { data, error: fetchError } = await deleteQuery;

    if (fetchError || !data) {
      throw new ProviderError('DRAFT_NOT_FOUND', `No draft with id "${id}" found for this user`);
    }

    const row = data as { gmail_id: string; draft_id: string | null };

    // ── Resolve the Gmail draft id ────────────────────────────────────────
    // Prefer the persisted draft_id, but fall back to a live Gmail lookup for
    // drafts synced via the webhook (which never had draft_id written). A null
    // result means the draft no longer exists in Gmail — the Supabase row is
    // orphaned, so we force-delete it below without a Gmail call.
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    const draftId = row.draft_id ?? await resolveDraftId(gmail, row.gmail_id);

    // ── Delete from Gmail (skip if the draft is already gone) ──────────────
    if (draftId) {
      try {
        await gmail.users.drafts.delete({
          userId: 'me',
          id:     draftId,
        });
      } catch (err) {
        // A 404 means Gmail already has no such draft — treat it as already
        // deleted and proceed to clean up our row. Anything else is a real
        // Gmail failure that should surface (and leave the row for retry).
        if (!isGmailNotFound(err)) {
          throw new ProviderError('GMAIL_DRAFT_FAILED', 'Gmail drafts.delete failed', err);
        }
      }
    }

    // ── Delete the Supabase row (force-removes an orphaned row too) ────────
    // Per CONTRACT.md §4.10: both must succeed. Surface error if Supabase fails.
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('gmail_id', id)
      .eq('user_id', payload.sub);

    if (deleteError) {
      // Gmail draft is already deleted — log the inconsistency and surface the error.
      // The row should be cleaned up manually or via a reconciliation job.
      throw new ProviderError(
        'GMAIL_DRAFT_FAILED',
        `Gmail draft deleted but Supabase row deletion failed: ${deleteError.message}`,
        deleteError,
      );
    }

    res.status(204).end();
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

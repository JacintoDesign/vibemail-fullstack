import { google, gmail_v1 } from 'googleapis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { Message } from '../types/message';
import { ProviderError } from '../types/provider';

const MAX_INITIAL_SYNC = 50;

// ── Supabase (lazy singleton) ────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  _supabase = createClient(url, key);
  return _supabase;
}

// ── Header extraction ────────────────────────────────────────────────────────

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string,
): string {
  const lower = name.toLowerCase();
  return headers.find(h => h.name?.toLowerCase() === lower)?.value ?? '';
}

// ── Body extraction ──────────────────────────────────────────────────────────

function decodeBase64Url(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

/**
 * Recursively searches a parts tree for the first part matching mimeType.
 * Handles nested multipart/alternative and multipart/mixed structures.
 */
function findPartByMimeType(
  parts: gmail_v1.Schema$MessagePart[],
  mimeType: string,
): string | null {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts && part.parts.length > 0) {
      const nested = findPartByMimeType(part.parts, mimeType);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function extractBodies(msg: gmail_v1.Schema$Message): {
  bodyPlain: string | null;
  bodyHtml: string | null;
} {
  const parts = msg.payload?.parts;

  if (parts && parts.length > 0) {
    return {
      bodyPlain: findPartByMimeType(parts, 'text/plain'),
      bodyHtml: findPartByMimeType(parts, 'text/html'),
    };
  }

  // Single-part message — root payload body holds the content.
  const data = msg.payload?.body?.data;
  if (!data) return { bodyPlain: null, bodyHtml: null };

  const decoded = decodeBase64Url(data);
  const rootMime = msg.payload?.mimeType ?? '';

  return {
    bodyPlain: rootMime === 'text/html' ? null : decoded,
    bodyHtml: rootMime === 'text/html' ? decoded : null,
  };
}

// ── Normalization ────────────────────────────────────────────────────────────

function normalizeMessage(
  msg: gmail_v1.Schema$Message,
  userId: string,
): Omit<Message, 'id' | 'createdAt' | 'updatedAt'> {
  const headers = msg.payload?.headers ?? [];
  const labelIds = msg.labelIds ?? [];
  const { bodyPlain, bodyHtml } = extractBodies(msg);

  return {
    userId,
    gmailId:   msg.id ?? '',
    threadId:  msg.threadId ?? '',
    labelIds,
    from:      getHeader(headers, 'from'),
    to:        getHeader(headers, 'to'),
    subject:   getHeader(headers, 'subject'),
    date:      getHeader(headers, 'date'),
    snippet:   msg.snippet ?? '',
    bodyPlain,
    bodyHtml,
    isRead:    !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
  };
}

// ── Supabase row mapping ─────────────────────────────────────────────────────
// The DB schema uses snake_case with from_address / to_address for the header
// fields (reserved-word avoidance) and is_read / is_starred for derived flags.

interface MessageRow {
  user_id:       string;
  gmail_id:      string;
  thread_id:     string;
  label_ids:     string[];
  from_address:  string;
  to_address:    string;
  subject:       string;
  date:          string;
  snippet:       string;
  body_plain:    string | null;
  body_html:     string | null;
  is_read:       boolean;
  is_starred:    boolean;
}

function toRow(msg: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>): MessageRow {
  return {
    user_id:      msg.userId,
    gmail_id:     msg.gmailId,
    thread_id:    msg.threadId,
    label_ids:    msg.labelIds,
    from_address: msg.from,
    to_address:   msg.to,
    subject:      msg.subject,
    date:         msg.date,
    snippet:      msg.snippet,
    body_plain:   msg.bodyPlain,
    body_html:    msg.bodyHtml,
    is_read:      msg.isRead,
    is_starred:   msg.isStarred,
  };
}

// ── Persistence helpers ──────────────────────────────────────────────────────

async function upsertMessages(
  supabase: SupabaseClient,
  messages: Array<Omit<Message, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .upsert(messages.map(toRow), { onConflict: 'gmail_id' });

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

async function storeHistoryId(
  supabase: SupabaseClient,
  userId: string,
  historyId: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ history_id: historyId })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('HISTORY_ID_STORE_FAILED', error.message, error);
  }
}

// ── Initial sync ─────────────────────────────────────────────────────────────

/**
 * Fetches up to MAX_INITIAL_SYNC (50) messages from INBOX, normalizes them
 * to the Message shape, and upserts them to Supabase.
 *
 * historyId is sourced from individual messages.get responses (it is NOT
 * present on the messages.list response). The historyId of the last fetched
 * message is stored to users.history_id so the Pub/Sub webhook receiver
 * can use it as the startHistoryId for subsequent history.list calls.
 */
export async function runInitialSync(userId: string): Promise<void> {
  const auth = await loadOAuth2Client(userId);
  const gmail = google.gmail({ version: 'v1', auth });
  const supabase = getSupabase();

  let fetched = 0;
  let pageToken: string | undefined;
  let lastHistoryId: string | undefined;

  while (fetched < MAX_INITIAL_SYNC) {
    const remaining = MAX_INITIAL_SYNC - fetched;

    const { data: listData } = await gmail.users.messages.list({
      userId:    'me',
      labelIds:  ['INBOX'],
      maxResults: remaining,
      ...(pageToken ? { pageToken } : {}),
    });

    const refs = listData.messages ?? [];
    if (refs.length === 0) break;

    const batch: Array<Omit<Message, 'id' | 'createdAt' | 'updatedAt'>> = [];

    for (const ref of refs) {
      if (!ref.id || fetched >= MAX_INITIAL_SYNC) break;

      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id:     ref.id,
        format: 'FULL',
      });

      // historyId is not on messages.list — track it from each messages.get
      if (msg.historyId) lastHistoryId = msg.historyId;

      batch.push(normalizeMessage(msg, userId));
      fetched++;
    }

    if (batch.length > 0) {
      await upsertMessages(supabase, batch);
    }

    if (!listData.nextPageToken || fetched >= MAX_INITIAL_SYNC) break;
    pageToken = listData.nextPageToken;
  }

  if (lastHistoryId) {
    await storeHistoryId(supabase, userId, lastHistoryId);
  }
}

import { gmail_v1 } from 'googleapis';
import { SupabaseClient } from '@supabase/supabase-js';
import { Message } from '../types/message';
import { ProviderError } from '../types/provider';

// ── Header extraction ────────────────────────────────────────────────────────

export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string,
): string {
  const lower = name.toLowerCase();
  return headers.find(h => h.name?.toLowerCase() === lower)?.value ?? '';
}

// ── Body extraction ──────────────────────────────────────────────────────────

export function decodeBase64Url(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

/**
 * Recursively searches a parts tree for the first part matching mimeType.
 * Handles nested multipart/alternative and multipart/mixed structures.
 */
export function findPartByMimeType(
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

export function extractBodies(msg: gmail_v1.Schema$Message): {
  bodyPlain: string | null;
  bodyHtml: string | null;
} {
  const parts = msg.payload?.parts;

  if (parts && parts.length > 0) {
    return {
      bodyPlain: findPartByMimeType(parts, 'text/plain'),
      bodyHtml:  findPartByMimeType(parts, 'text/html'),
    };
  }

  // Single-part message — root payload body holds the content.
  const data = msg.payload?.body?.data;
  if (!data) return { bodyPlain: null, bodyHtml: null };

  const decoded  = decodeBase64Url(data);
  const rootMime = msg.payload?.mimeType ?? '';

  return {
    bodyPlain: rootMime === 'text/html' ? null : decoded,
    bodyHtml:  rootMime === 'text/html' ? decoded : null,
  };
}

// ── Normalization ────────────────────────────────────────────────────────────

export function normalizeMessage(
  msg: gmail_v1.Schema$Message,
  userId: string,
): Omit<Message, 'id' | 'createdAt' | 'updatedAt'> {
  const headers  = msg.payload?.headers ?? [];
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
// DB schema uses snake_case; from_address / to_address avoid SQL reserved words.

export interface MessageRow {
  user_id:      string;
  gmail_id:     string;
  thread_id:    string;
  label_ids:    string[];
  from_address: string;
  to_address:   string;
  subject:      string;
  date:         string;
  snippet:      string;
  body_plain:   string | null;
  body_html:    string | null;
  is_read:      boolean;
  is_starred:   boolean;
}

export function toRow(
  msg: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>,
): MessageRow {
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

// ── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertMessages(
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

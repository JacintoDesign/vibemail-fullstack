import { gmail_v1 } from 'googleapis';
import { Message, MessageStatus } from '../types/message';
import { ProviderError } from '../types/provider';
import { getClient } from '../db';

// ── Status derivation ────────────────────────────────────────────────────────

/**
 * Derives the message status from Gmail labelIds using the priority order
 * defined in CONTRACT.md §3. Called at write time — never stored as a
 * client-supplied value.
 */
export function deriveStatus(labelIds: string[]): MessageStatus {
  if (labelIds.includes('DRAFT'))                                            return 'draft';
  if (labelIds.includes('TRASH'))                                            return 'trash';
  if (labelIds.includes('SENT') && !labelIds.includes('DRAFT'))             return 'sent';
  if (!labelIds.includes('INBOX') && !labelIds.includes('SENT'))            return 'archived';
  return 'inbox';
}

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
  draftId: string | null = null,
): Omit<Message, 'id' | 'createdAt' | 'updatedAt'> {
  const headers  = msg.payload?.headers ?? [];
  const labelIds = msg.labelIds ?? [];
  const { bodyPlain, bodyHtml } = extractBodies(msg);

  return {
    userId,
    gmailId:      msg.id ?? '',
    threadId:     msg.threadId ?? '',
    labelIds,
    internalDate: msg.internalDate ?? '0',
    from:         getHeader(headers, 'from'),
    to:           getHeader(headers, 'to'),
    subject:      getHeader(headers, 'subject'),
    date:         getHeader(headers, 'date'),
    snippet:      msg.snippet ?? '',
    bodyPlain,
    bodyHtml,
    isRead:       !labelIds.includes('UNREAD'),
    isStarred:    labelIds.includes('STARRED'),
    status:       deriveStatus(labelIds),
    draftId,
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
  status:       string;
  draft_id:     string | null;
  created_at:   string;   // set to internalDate ISO so rows sort by email receipt time
}

function internalDateToIso(ms: string): string {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date().toISOString();
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
    status:       msg.status,
    draft_id:     msg.draftId,
    created_at:   internalDateToIso(msg.internalDate),
  };
}

// ── DB row → Message ─────────────────────────────────────────────────────────

export interface DbMessageRow {
  id:           string;
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
  status:       string;
  draft_id:     string | null;
  created_at:   string;
  updated_at:   string;
}

export function rowToMessage(row: DbMessageRow): Message {
  return {
    id:           row.id,
    userId:       row.user_id,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    gmailId:      row.gmail_id,
    threadId:     row.thread_id,
    labelIds:     row.label_ids,
    internalDate: String(new Date(row.created_at).getTime()),
    from:         row.from_address,
    to:           row.to_address,
    subject:      row.subject,
    date:         row.date,
    snippet:      row.snippet,
    bodyPlain:    row.body_plain,
    bodyHtml:     row.body_html,
    isRead:       row.is_read,
    isStarred:    row.is_starred,
    status:       row.status as Message['status'],
    draftId:      row.draft_id,
  };
}

// ── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertMessages(
  messages: Array<Omit<Message, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  // Cast required: status and draft_id are new columns not yet reflected
  // in the Supabase generated types. They will be present once the schema
  // migration runs (see migrations/ on the schema branch).
  const { error } = await getClient()
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(messages.map(toRow) as any[], { onConflict: 'gmail_id' });

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

/**
 * src/db/index.ts — Supabase database layer
 *
 * Single source of truth for all database reads and writes.  The client is
 * typed against the generated Database schema (src/types/database.ts) so
 * every table access is statically checked against the real column shapes.
 *
 * All writes use the service-role key, which bypasses Supabase RLS policies.
 * Never expose this client or its key to the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, Tables, TablesInsert } from '../types/database';
import { Message } from '../types/message';
import { ProviderError } from '../types/provider';

// ── Typed client (lazy singleton) ────────────────────────────────────────────

let _client: SupabaseClient<Database> | null = null;

/**
 * Returns the singleton typed Supabase client.
 * Throws CONFIG_ERROR if required env vars are absent.
 */
export function getClient(): SupabaseClient<Database> {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }

  _client = createClient<Database>(url, key);
  return _client;
}

// ── Row type aliases ─────────────────────────────────────────────────────────

/** Full users row as returned by SELECT *. */
export type UserRow    = Tables<'users'>;

/** Full messages row as returned by SELECT *. */
export type MessageRow = Tables<'messages'>;

// ── upsertMessage ─────────────────────────────────────────────────────────────

/**
 * Upserts a single message into the messages table.
 *
 * Conflict target: gmail_id (unique index).  On conflict the row is updated
 * with the latest field values — this handles label changes (e.g. UNREAD →
 * read) arriving via subsequent Pub/Sub notifications.
 *
 * Field mapping:
 *   msg.from  → from_address  (avoids reserved word collision)
 *   msg.to    → to_address
 */
export async function upsertMessage(
  msg: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const row: TablesInsert<'messages'> = {
    user_id:      msg.userId,
    gmail_id:     msg.gmailId,
    thread_id:    msg.threadId,
    label_ids:    msg.labelIds,
    from_address: msg.from,       // from  → from_address
    to_address:   msg.to,         // to    → to_address
    subject:      msg.subject,
    date:         msg.date,
    snippet:      msg.snippet,
    body_plain:   msg.bodyPlain,
    body_html:    msg.bodyHtml,
    is_read:      msg.isRead,
    is_starred:   msg.isStarred,
  };

  const { error } = await getClient()
    .from('messages')
    .upsert(row, { onConflict: 'gmail_id' });

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

// ── getUser ───────────────────────────────────────────────────────────────────

/**
 * Fetches a single user row by primary key.
 * Returns null when no row exists for the given userId.
 * Throws on unexpected database errors.
 */
export async function getUser(userId: string): Promise<UserRow | null> {
  const { data, error } = await getClient()
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new ProviderError('USER_NOT_FOUND', error.message, error);
  }

  return data;
}

// ── updateUserTokens ──────────────────────────────────────────────────────────

/**
 * Writes refreshed OAuth credentials for a user.
 * Called by the googleapis 'tokens' event listener on every silent refresh.
 *
 * All three values arrive pre-encrypted — this function does not perform any
 * cryptographic operations.
 */
export async function updateUserTokens(
  userId: string,
  tokens: {
    encryptedAccessToken:   string;
    encryptedRefreshToken?: string;   // omit when only the access token rotated
    tokenExpiresAt:         number | null;
  },
): Promise<void> {
  const payload: {
    encrypted_access_token:   string;
    encrypted_refresh_token?: string;
    token_expires_at:         number | null;
  } = {
    encrypted_access_token: tokens.encryptedAccessToken,
    token_expires_at:       tokens.tokenExpiresAt,
  };
  if (tokens.encryptedRefreshToken !== undefined) {
    payload.encrypted_refresh_token = tokens.encryptedRefreshToken;
  }

  const { error } = await getClient()
    .from('users')
    .update(payload)
    .eq('id', userId);

  if (error) {
    throw new ProviderError('TOKEN_UPDATE_FAILED', error.message, error);
  }
}

// ── updateHistoryId ───────────────────────────────────────────────────────────

/**
 * Advances users.history_id after each successful sync cycle.
 * The stored history_id is the startHistoryId for the next delta fetch.
 */
export async function updateHistoryId(
  userId:    string,
  historyId: string,
): Promise<void> {
  const { error } = await getClient()
    .from('users')
    .update({ history_id: historyId })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('SYNC_UPSERT_FAILED', error.message, error);
  }
}

// ── updateWatchExpiry ─────────────────────────────────────────────────────────

/**
 * Persists the Gmail watch expiry timestamp and resource ID after a renewal.
 * watch_expiry is a Unix timestamp in milliseconds (as returned by Gmail API).
 * watch_resource_id can be null when the caller wants to clear the field.
 */
export async function updateWatchExpiry(
  userId:          string,
  watchExpiry:     number | null,
  watchResourceId: string | null,
): Promise<void> {
  const { error } = await getClient()
    .from('users')
    .update({
      watch_expiry:      watchExpiry,
      watch_resource_id: watchResourceId,
    })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('WATCH_SETUP_FAILED', error.message, error);
  }
}

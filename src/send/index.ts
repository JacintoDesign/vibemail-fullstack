import { google } from 'googleapis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { SendMessageOptions, ProviderError } from '../types/provider';
import { Message } from '../types/message';
import { normalizeMessage, upsertMessages } from '../sync/normalize';

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

// ── RFC 2822 construction ────────────────────────────────────────────────────

/**
 * Builds a minimal RFC 2822 message string and returns it base64url-encoded,
 * ready for the Gmail API `raw` field.
 *
 * Line endings are \r\n per RFC 2822 §2.1.
 * The blank line between headers and body is required by the spec.
 */
function buildRaw(from: string, options: SendMessageOptions): string {
  const headers = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ].join('\r\n');

  const message = `${headers}\r\n\r\n${options.body}`;
  return Buffer.from(message).toString('base64url');
}

// ── Send ─────────────────────────────────────────────────────────────────────

/**
 * Sends an email via the Gmail API on behalf of the authenticated user,
 * then fetches the full sent message, normalizes it to the Message shape
 * (mapping from_address / to_address for the DB schema), and upserts it
 * to Supabase.
 *
 * Returns the full normalized Message as it was stored.
 */
export async function sendMessage(
  userId: string,
  options: SendMessageOptions,
): Promise<Message> {
  const auth    = await loadOAuth2Client(userId);
  const gmail   = google.gmail({ version: 'v1', auth });
  const supabase = getSupabase();

  // Fetch sender address for the RFC 2822 From header.
  const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.emailAddress;
  if (!from) {
    throw new ProviderError(
      'GMAIL_SEND_FAILED',
      'Could not retrieve sender email address from Gmail profile',
    );
  }

  // Build and encode the RFC 2822 message.
  const raw = buildRaw(from, options);

  // Send via Gmail API.
  let sentId: string;
  try {
    const { data: sent } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        ...(options.threadId ? { threadId: options.threadId } : {}),
      },
    });

    if (!sent.id) {
      throw new ProviderError(
        'GMAIL_SEND_FAILED',
        'Gmail did not return a message ID after send',
      );
    }
    sentId = sent.id;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError('GMAIL_SEND_FAILED', 'Gmail messages.send failed', err);
  }

  // Fetch the full sent message so we have headers and body for normalization.
  // messages.send returns a partial Message — payload may be empty.
  const { data: fullMsg } = await gmail.users.messages.get({
    userId: 'me',
    id:     sentId,
    format: 'FULL',
  });

  // Normalize to Message shape.
  // normalizeMessage extracts from/to headers and maps them;
  // upsertMessages maps them to from_address / to_address in the DB row.
  const normalized = normalizeMessage(fullMsg, userId);
  await upsertMessages(supabase, [normalized]);

  // Return the full Message record.
  // id is set to gmailId per CONTRACT.md §3; timestamps are Supabase-managed
  // and approximated here since the upsert does not return the inserted row.
  return {
    ...normalized,
    id:        fullMsg.id ?? sentId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

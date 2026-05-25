import { google } from 'googleapis';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { Message } from '../types/message';
import { ProviderError } from '../types/provider';
import { normalizeMessage, upsertMessages } from '../sync/normalize';
import { getClient, updateHistoryId } from '../db';

// ── PubSub payload types ─────────────────────────────────────────────────────

interface PubSubMessage {
  data:        string;   // base64-encoded GmailNotification JSON
  messageId:   string;
  publishTime: string;
}

export interface PubSubPayload {
  message:      PubSubMessage;
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId:    number;  // arrives as a number in the JSON
}

// ── Payload decoding ─────────────────────────────────────────────────────────

function decodePubSubData(data: string): GmailNotification {
  let json: string;
  try {
    json = Buffer.from(data, 'base64').toString('utf8');
  } catch {
    throw new ProviderError('WEBHOOK_DECODE_FAILED', 'Failed to base64-decode PubSub data field');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProviderError('WEBHOOK_DECODE_FAILED', 'PubSub data field is not valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).emailAddress !== 'string' ||
    typeof (parsed as Record<string, unknown>).historyId !== 'number'
  ) {
    throw new ProviderError(
      'WEBHOOK_DECODE_FAILED',
      'PubSub data missing required fields: emailAddress (string), historyId (number)',
    );
  }

  return parsed as GmailNotification;
}

// ── User lookup ──────────────────────────────────────────────────────────────

async function getUserByEmail(
  email: string,
): Promise<{ id: string; history_id: string | null } | null> {
  const { data, error } = await getClient()
    .from('users')
    .select('id, history_id')
    .eq('email', email)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// ── History delta ────────────────────────────────────────────────────────────

/**
 * Pages through history.list from startHistoryId, collecting all unique
 * message IDs from messagesAdded, labelsAdded, and labelsRemoved events.
 * Returns a deduplicated Set of Gmail message IDs to fetch in full.
 */
async function collectDeltaMessageIds(
  gmail: ReturnType<typeof google.gmail>,
  startHistoryId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;

  do {
    const { data } = await gmail.users.history.list({
      userId:         'me',
      startHistoryId,
      historyTypes:   ['messageAdded', 'labelAdded', 'labelRemoved'],
      ...(pageToken ? { pageToken } : {}),
    });

    for (const record of data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id);
      }
      for (const labelAdd of record.labelsAdded ?? []) {
        if (labelAdd.message?.id) ids.add(labelAdd.message.id);
      }
      for (const labelRemove of record.labelsRemoved ?? []) {
        if (labelRemove.message?.id) ids.add(labelRemove.message.id);
      }
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return ids;
}

// ── Main handler ─────────────────────────────────────────────────────────────

/**
 * Processes a Gmail Pub/Sub push notification.
 *
 * CALLER CONTRACT: The HTTP entry point (api/webhook/gmail.ts) MUST send
 * HTTP 200 to the caller BEFORE invoking this function. PubSub considers
 * delivery successful on receipt of 200 — responding first prevents retries
 * if downstream processing takes longer than PubSub's ack deadline.
 *
 * This function validates the verification token, decodes the notification,
 * fetches the history delta, normalizes and upserts new/modified messages,
 * and advances the stored history_id. Errors are thrown to the caller for
 * logging; they do not affect the already-sent 200 response.
 */
export async function processGmailNotification(
  rawBody: unknown,
  incomingToken: string,
): Promise<void> {
  // ── 1. Validate verification token ────────────────────────────────────────
  const expectedToken = process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
  if (!expectedToken || incomingToken !== expectedToken) {
    // Invalid token — log and return. Do not throw: the 200 is already sent
    // and retrying an unverifiable message is pointless.
    console.error('[webhook:gmail] Rejected: invalid GOOGLE_PUBSUB_VERIFICATION_TOKEN');
    return;
  }

  // ── 2. Parse and validate the PubSub payload ──────────────────────────────
  if (
    typeof rawBody !== 'object' ||
    rawBody === null ||
    !('message' in rawBody) ||
    typeof (rawBody as Record<string, unknown>).message !== 'object'
  ) {
    console.error('[webhook:gmail] Rejected: malformed PubSub payload shape');
    return;
  }

  const payload = rawBody as PubSubPayload;
  let notification: GmailNotification;
  try {
    notification = decodePubSubData(payload.message.data);
  } catch (err) {
    console.error('[webhook:gmail] Rejected: failed to decode PubSub data', err);
    return;
  }
  const { emailAddress, historyId } = notification;
  const newHistoryId = String(historyId);

  // ── 3. Fetch user ──────────────────────────────────────────────────────────
  const user = await getUserByEmail(emailAddress);

  if (!user) {
    console.error(`[webhook:gmail] No user found for email: ${emailAddress}`);
    return;
  }

  // ── 4. Skip if no stored history_id (initial sync hasn't run yet) ─────────
  if (!user.history_id) {
    console.warn(
      `[webhook:gmail] No history_id stored for user ${user.id} — ` +
      'initial sync has not completed; updating history_id and skipping delta.',
    );
    await updateHistoryId(user.id, newHistoryId);
    return;
  }

  // ── 5. Fetch history delta ─────────────────────────────────────────────────
  const auth  = await loadOAuth2Client(user.id);
  const gmail = google.gmail({ version: 'v1', auth });

  const messageIds = await collectDeltaMessageIds(gmail, user.history_id);

  // ── 6. Fetch, normalize, and upsert affected messages ────────────────────
  if (messageIds.size > 0) {
    const batch: Array<Omit<Message, 'id' | 'createdAt' | 'updatedAt'>> = [];

    for (const id of messageIds) {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'FULL',
      });
      batch.push(normalizeMessage(msg, user.id));
    }

    await upsertMessages(batch);
  }

  // ── 7. Advance stored history_id ──────────────────────────────────────────
  await updateHistoryId(user.id, newHistoryId);
}

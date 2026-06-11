import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import { loadOAuth2Client } from '../providers/gmail/auth';
import { SendMessageOptions, ProviderError } from '../types/provider';
import { Message } from '../types/message';
import { normalizeMessage, upsertMessages } from '../sync/normalize';
import { fetchAttachment, ParsedFile } from '../attachments/index';

// ── RFC 2822 construction ────────────────────────────────────────────────────

/** Wrap base64 at 76 chars per MIME (RFC 2045 §6.8). */
function base64Lines(buf: Buffer): string {
  return (buf.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Strip characters that would break a quoted MIME header parameter. */
function headerSafeName(name: string): string {
  return name.replace(/["\r\n]/g, '_');
}

/**
 * Builds a minimal RFC 2822 message string and returns it base64url-encoded,
 * ready for the Gmail API `raw` field.
 *
 * Line endings are \r\n per RFC 2822 §2.1. With no attachments the message is a
 * single text/plain part (as before); with attachments it becomes a
 * multipart/mixed envelope whose first part is the text body and whose
 * remaining parts are the base64-encoded files.
 */
export function buildRaw(from: string, options: SendMessageOptions, attachments: ParsedFile[]): string {
  if (attachments.length === 0) {
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

  const boundary = `vibemail_${randomUUID()}`;
  const headers = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join('\r\n');

  // Text body — base64 so any UTF-8 content rides through unscathed.
  const textPart =
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    `${base64Lines(Buffer.from(options.body, 'utf8'))}\r\n`;

  const fileParts = attachments
    .map((file) => {
      const name = headerSafeName(file.filename);
      return (
        `--${boundary}\r\n` +
        `Content-Type: ${file.mimeType}; name="${name}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n' +
        `Content-Disposition: attachment; filename="${name}"\r\n\r\n` +
        `${base64Lines(file.data)}\r\n`
      );
    })
    .join('');

  const message = `${headers}\r\n\r\n${textPart}${fileParts}--${boundary}--`;
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
  const auth  = await loadOAuth2Client(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Fetch sender address for the RFC 2822 From header.
  const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.emailAddress;
  if (!from) {
    throw new ProviderError(
      'GMAIL_SEND_FAILED',
      'Could not retrieve sender email address from Gmail profile',
    );
  }

  // Pull any staged attachments (verifying each belongs to this user) so they
  // can be folded into the MIME envelope.
  const attachments =
    options.attachmentIds && options.attachmentIds.length
      ? await Promise.all(options.attachmentIds.map((id) => fetchAttachment(userId, id)))
      : [];

  // Build and encode the RFC 2822 message.
  const raw = buildRaw(from, options, attachments);

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
  await upsertMessages([normalized]);

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

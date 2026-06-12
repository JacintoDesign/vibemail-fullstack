import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { verifyJwt } from '../../src/middleware/jwt';
import { errorResponse, handleError } from '../../src/middleware/error';
import { ProviderError } from '../../src/types/provider';
import { loadOAuth2Client } from '../../src/providers/gmail/auth';

/**
 * GET /api/v1/labels
 *
 * Returns the Gmail label catalog (system + user labels) for the authenticated
 * user, each with its message/thread totals and unread counts. The sidebar uses
 * this for folder badges (Inbox unread, Drafts count, …) and label chips.
 *
 * labels.list returns only id/name/type, so per-label counts come from a
 * labels.get per label (issued in parallel). A mailbox has on the order of tens
 * of labels, so this is a small fixed fan-out, not unbounded work.
 */
export interface LabelSummary {
  id:            string;
  name:          string;
  type:          'system' | 'user';
  messagesTotal:  number;
  messagesUnread: number;
  threadsTotal:   number;
  threadsUnread:  number;
  color:          { textColor?: string; backgroundColor?: string } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted on this endpoint');
    return;
  }

  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  try {
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    let labelStubs;
    try {
      const { data } = await gmail.users.labels.list({ userId: 'me' });
      labelStubs = data.labels ?? [];
    } catch (err) {
      throw mapGmailError(err, 'Gmail labels.list failed');
    }

    let labels: LabelSummary[];
    try {
      labels = await Promise.all(
        labelStubs
          .filter((l) => typeof l.id === 'string')
          .map(async (stub) => {
            const { data: full } = await gmail.users.labels.get({ userId: 'me', id: stub.id! });
            return {
              id:             full.id ?? stub.id!,
              name:           full.name ?? stub.name ?? full.id ?? stub.id!,
              type:           (full.type === 'user' ? 'user' : 'system') as 'system' | 'user',
              messagesTotal:  full.messagesTotal  ?? 0,
              messagesUnread: full.messagesUnread ?? 0,
              threadsTotal:   full.threadsTotal   ?? 0,
              threadsUnread:  full.threadsUnread  ?? 0,
              color:          full.color
                ? {
                    textColor:       full.color.textColor       ?? undefined,
                    backgroundColor: full.color.backgroundColor ?? undefined,
                  }
                : null,
            };
          }),
      );
    } catch (err) {
      throw mapGmailError(err, 'Gmail labels.get failed');
    }

    res.status(200).json({ labels });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Surfaces Gmail 429s as GMAIL_RATE_LIMITED and everything else as
 * GMAIL_LABELS_FAILED, matching the typed-error convention used elsewhere.
 */
function mapGmailError(err: unknown, message: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const status =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: number }).code
      : undefined;
  if (status === 429) {
    return new ProviderError('GMAIL_RATE_LIMITED', 'Gmail rate limit hit while reading labels', err);
  }
  return new ProviderError('GMAIL_LABELS_FAILED', message, err);
}

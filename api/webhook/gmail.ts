import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorResponse } from '../../src/middleware/error';
import { processGmailNotification } from '../../src/webhook/gmail';

/**
 * POST /webhook/gmail
 *
 * Receives Pub/Sub push notifications for Gmail changes.
 * Authentication: GOOGLE_PUBSUB_VERIFICATION_TOKEN query param (not JWT).
 *
 * CRITICAL: HTTP 200 is sent immediately before processing begins.
 * PubSub marks delivery successful on receipt of 200 — any ack deadline
 * overrun would trigger retries. Processing errors are logged; they do not
 * affect the already-sent acknowledgment.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted on this endpoint');
    return;
  }

  // ── Acknowledge immediately ───────────────────────────────────────────────
  // PubSub requires a 2xx within its ack deadline. Responding before any
  // async work guarantees we never miss the window regardless of processing time.
  res.status(200).end();

  // ── Extract verification token ────────────────────────────────────────────
  const { token } = req.query;
  const incomingToken = typeof token === 'string' ? token : '';

  // ── Process asynchronously (200 already sent) ─────────────────────────────
  processGmailNotification(req.body, incomingToken).catch((err: unknown) => {
    console.error('[webhook:gmail] processGmailNotification error:', err);
  });
}

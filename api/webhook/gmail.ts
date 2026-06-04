import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorResponse } from '../../src/middleware/error';
import { processGmailNotification } from '../../src/webhook/gmail';

/**
 * POST /webhook/gmail
 *
 * Receives Pub/Sub push notifications for Gmail changes.
 * Authentication: GOOGLE_PUBSUB_VERIFICATION_TOKEN query param (not JWT).
 *
 * Processing completes before the 200 is sent so that Pub/Sub retries on
 * any unhandled error. The "respond-first" pattern does not work in Vercel
 * Serverless Functions — the process is terminated as soon as the response
 * is flushed, killing any async work started afterwards.
 *
 * Typical processing time (history.list + 1-3 messages.get + DB upserts)
 * is well under 5 s, safely inside Pub/Sub's ack deadline.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted on this endpoint');
    return;
  }

  const { token } = req.query;
  const incomingToken = typeof token === 'string' ? token : '';

  try {
    await processGmailNotification(req.body, incomingToken);
  } catch (err) {
    // Log but still ack — a permanent error (bad payload, missing user) should
    // not trigger infinite Pub/Sub retries.
    console.error('[webhook:gmail] processGmailNotification error:', err);
  }

  res.status(200).end();
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { verifyJwt } from '../../src/middleware/jwt';
import { errorResponse, handleError } from '../../src/middleware/error';
import { ProviderError } from '../../src/types/provider';
import { loadOAuth2Client } from '../../src/providers/gmail/auth';
import { MAX_ATTACHMENT_BYTES, createUpload, createInboundDownloadUrl } from '../../src/attachments/index';

/**
 * /api/v1/attachments
 *
 * POST — begin an OUTBOUND attachment upload (CONTRACT.md §4.12). Takes small
 *   JSON `{ filename, size }` and returns a short-lived signed URL the browser
 *   PUTs the file bytes to directly (Supabase Storage). The bytes never pass
 *   through this function, so the platform's ~4.5 MB request-body limit does not
 *   cap the upload — 25 MB works in production and locally. The returned
 *   `attachmentId` is referenced in `attachmentIds` on `POST /api/v1/messages`.
 *
 * GET — download a received-mail attachment. Fetches the bytes from Gmail with
 *   the caller's own OAuth client (so a user can only ever read attachments from
 *   their own mailbox), stages them in Storage, and returns a short-lived signed
 *   `{ downloadUrl }` the browser fetches directly. Returning a URL rather than
 *   the bytes keeps the function response under the ~4.5 MB limit, so large
 *   (20 MB+) attachments download fine. Query: `messageId` (Gmail message id),
 *   `attachmentId` (the part's `body.attachmentId`), and optional `filename` /
 *   `mimeType` for the saved file name and content type.
 *
 * Both require a Bearer JWT.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET')  return handleDownload(req, res);
  if (req.method === 'POST') return handleUploadInit(req, res);
  errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are accepted on this endpoint');
}

// ── GET /api/v1/attachments — download received-mail attachment ───────────────

async function handleDownload(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const { messageId, attachmentId, filename, mimeType } = req.query;
  if (typeof messageId !== 'string' || messageId.trim() === '') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'messageId is required');
    return;
  }
  if (typeof attachmentId !== 'string' || attachmentId.trim() === '') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'attachmentId is required');
    return;
  }

  try {
    const auth  = await loadOAuth2Client(payload.sub);
    const gmail = google.gmail({ version: 'v1', auth });

    let data: string | null | undefined;
    try {
      const result = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });
      data = result.data.data;
    } catch (err) {
      throw new ProviderError('ATTACHMENT_NOT_FOUND', 'Attachment could not be fetched from Gmail', err);
    }

    if (!data) {
      throw new ProviderError('ATTACHMENT_NOT_FOUND', 'Attachment has no body data');
    }

    const bytes = Buffer.from(data, 'base64url');
    const downloadName = typeof filename === 'string' && filename.trim() !== ''
      ? filename
      : 'attachment';
    const contentType = typeof mimeType === 'string' && mimeType.trim() !== ''
      ? mimeType
      : 'application/octet-stream';

    const downloadUrl = await createInboundDownloadUrl(
      payload.sub,
      messageId,
      attachmentId,
      bytes,
      downloadName,
      contentType,
    );

    res.status(200).json({
      downloadUrl,
      filename: downloadName,
      mimeType: contentType,
      size: bytes.length,
    });
  } catch (err) {
    handleError(res, err);
  }
}

// ── POST /api/v1/attachments — begin an outbound upload ───────────────────────

async function handleUploadInit(req: VercelRequest, res: VercelResponse): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { filename, size } = body;

  if (typeof filename !== 'string' || filename.trim() === '') {
    errorResponse(res, 400, 'MISSING_FIELDS', 'filename is required');
    return;
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    errorResponse(res, 400, 'MISSING_FIELDS', 'size must be a positive number of bytes');
    return;
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    errorResponse(res, 413, 'FILE_TOO_LARGE', `File exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit`);
    return;
  }

  try {
    const result = await createUpload(payload.sub, filename);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from '../../src/middleware/jwt';
import { errorResponse, handleError } from '../../src/middleware/error';
import { MAX_ATTACHMENT_BYTES, createUpload } from '../../src/attachments/index';

/**
 * POST /api/v1/attachments — begin an attachment upload (CONTRACT.md §4.12).
 *
 * Takes small JSON `{ filename, size }` and returns a short-lived signed URL the
 * browser PUTs the file bytes to directly (Supabase Storage). The bytes never
 * pass through this function, so the platform's ~4.5 MB request-body limit does
 * not cap the upload — 25 MB works in production and locally. The returned
 * `attachmentId` is referenced in `attachmentIds` on `POST /api/v1/messages`.
 *
 * Requires a Bearer JWT.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted on this endpoint');
    return;
  }

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

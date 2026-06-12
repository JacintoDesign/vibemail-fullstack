/**
 * src/attachments/index.ts — attachment upload + retrieval
 *
 * Backs `POST /api/v1/attachments`. The endpoint issues a short-lived signed
 * upload URL and the browser PUTs the file bytes straight to a private Supabase
 * Storage bucket — the bytes never pass through the serverless function, so the
 * platform's ~4.5 MB request-body limit doesn't cap the upload (this is what
 * lets 25 MB work in production as well as locally). The returned `attachmentId`
 * is the storage path, namespaced by user id so send-time can verify ownership
 * before attaching.
 */

import { createHash, randomUUID } from 'crypto';
import { getClient } from '../db/index';
import { ProviderError } from '../types/provider';

/** 25 MB hard limit (CONTRACT.md §4.12). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const BUCKET = 'attachments';

/** A single uploaded file extracted from the multipart body. */
export interface ParsedFile {
  filename: string;
  mimeType: string;
  data: Buffer;
}

/** The signed-upload handshake returned by `POST /api/v1/attachments`. */
export interface CreatedUpload {
  /** Opaque id (the user-namespaced storage path) referenced later on send. */
  attachmentId: string;
  /** Absolute, short-lived URL the browser PUTs the file bytes to. */
  uploadUrl: string;
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Strip path separators so a filename can't escape its storage prefix. */
function safeName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\r\n]/g, '').slice(0, 200) || 'file';
}

// Set once per warm serverless instance so we don't re-hit the Storage admin
// API on every upload-init.
let bucketReady = false;

/**
 * Ensure the private bucket exists and its per-file size limit is large enough
 * for 25 MB uploads. Created on first use; an already-existing bucket has its
 * limit refreshed (it may have used the project default).
 */
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const client = getClient();
  const opts = { public: false, fileSizeLimit: MAX_ATTACHMENT_BYTES };
  const { data } = await client.storage.getBucket(BUCKET);
  if (data) {
    await client.storage.updateBucket(BUCKET, opts);
  } else {
    const { error } = await client.storage.createBucket(BUCKET, opts);
    // A concurrent request may have created it between getBucket and now.
    if (error && !/exist/i.test(error.message)) {
      throw new ProviderError('UPLOAD_FAILED', 'Could not provision attachment storage', error);
    }
  }
  bucketReady = true;
}

/**
 * Reserve a storage path for one file and return a signed URL the browser uploads
 * the bytes to directly. The file never transits the serverless function, so the
 * platform request-body limit does not apply.
 */
export async function createUpload(userId: string, filename: string): Promise<CreatedUpload> {
  await ensureBucket();
  const path = `${userId}/${randomUUID()}/${safeName(filename)}`;
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new ProviderError('UPLOAD_FAILED', 'Could not create a signed upload URL', error);
  }
  return { attachmentId: path, uploadUrl: data.signedUrl };
}

/**
 * Stage a received-mail attachment's bytes in Storage and return a short-lived
 * signed URL the browser downloads directly. This bypasses the serverless
 * response-body limit (~4.5 MB) the same way uploads bypass the request limit:
 * the bytes go function → Storage and then browser → Storage, never through the
 * function's own response — so 20 MB+ downloads work.
 *
 * The object path is keyed by message + attachment (the long opaque Gmail
 * attachmentId is hashed to keep the path short and filesystem-safe), so a
 * repeat download of the same file reuses one staged object instead of piling
 * up copies. The signed URL carries a Content-Disposition that names the saved
 * file and expires after a few minutes.
 */
export async function createInboundDownloadUrl(
  userId: string,
  messageId: string,
  attachmentId: string,
  bytes: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  await ensureBucket();
  const idHash = createHash('sha256').update(attachmentId).digest('hex').slice(0, 32);
  const path = `${userId}/inbound/${safeName(messageId)}/${idHash}`;
  const client = getClient();

  const { error: upErr } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (upErr) {
    throw new ProviderError('UPLOAD_FAILED', 'Could not stage attachment for download', upErr);
  }

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, 300, { download: safeName(filename) });
  if (error || !data) {
    throw new ProviderError('ATTACHMENT_NOT_FOUND', 'Could not create a download URL', error);
  }
  return data.signedUrl;
}

/**
 * Download a previously-uploaded attachment for send-time MIME assembly. The
 * id must live under the requesting user's prefix — this blocks one user from
 * attaching another user's file by id-guessing.
 */
export async function fetchAttachment(userId: string, attachmentId: string): Promise<ParsedFile> {
  if (!attachmentId.startsWith(`${userId}/`)) {
    throw new ProviderError('ATTACHMENT_NOT_FOUND', 'Attachment does not belong to this user');
  }
  const { data, error } = await getClient().storage.from(BUCKET).download(attachmentId);
  if (error || !data) {
    throw new ProviderError('ATTACHMENT_NOT_FOUND', 'Attachment not found', error);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    filename: attachmentId.split('/').pop() || 'file',
    mimeType: data.type || 'application/octet-stream',
    data: buffer,
  };
}

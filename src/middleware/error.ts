import { VercelResponse } from '@vercel/node';
import { ProviderError } from '../types/provider';

/**
 * Sends the CONTRACT.md error envelope: { error: { code, message, details? } }
 * Use for every non-2xx response — no bare strings, no HTML.
 */
export function errorResponse(
  res:     VercelResponse,
  status:  number,
  code:    string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

/**
 * Maps a caught ProviderError (or unknown error) to the appropriate HTTP
 * status and sends the error envelope.
 * Used at the boundary of each handler's catch block.
 */
export function handleError(res: VercelResponse, err: unknown): void {
  if (err instanceof ProviderError) {
    const statusMap: Record<string, number> = {
      UNAUTHORIZED:          401,
      SCOPE_MISSING:         403,
      USER_NOT_FOUND:        404,
      MESSAGE_NOT_FOUND:     404,
      THREAD_NOT_FOUND:      404,
      ATTACHMENT_NOT_FOUND:  404,
      ALREADY_IN_STATE:      409,
      MISSING_FILE:          400,
      FILE_TOO_LARGE:        413,
      INVALID_LIMIT:         422,
      GMAIL_RATE_LIMITED:    429,
      UPLOAD_FAILED:         500,
      TOKEN_EXCHANGE_FAILED: 502,
      GMAIL_LIST_FAILED:     502,
      GMAIL_SEND_FAILED:     502,
      GMAIL_MODIFY_FAILED:   502,
      GMAIL_UNAVAILABLE:     503,
    };
    const status = statusMap[err.code] ?? 500;
    errorResponse(res, status, err.code, err.message, err.details);
    return;
  }

  // Unknown error — don't leak internals
  errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

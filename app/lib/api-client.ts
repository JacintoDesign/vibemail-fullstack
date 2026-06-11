// Phase-2 stub. Not wired in Phase 1 — kept here so the data-source seam has a
// concrete target. A thin fetch wrapper that attaches the Bearer JWT, uses the
// /api/v1 base path, and surfaces the CONTRACT error envelope.

import { forceSignOut, getToken } from "./auth";

const API_BASE = "/api/v1";

/** The CONTRACT.md error envelope: { error: { code, message, details? } }. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.error.message);
    this.name = "ApiError";
    this.code = envelope.error.code;
    this.status = status;
    this.details = envelope.error.details;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const envelope = (data ?? {
      error: { code: "UNKNOWN", message: res.statusText },
    }) as ApiErrorEnvelope;
    // An expired or invalid JWT is unrecoverable in-app — drop the token and
    // bounce back to the sign-in surface (which restarts the OAuth flow).
    if (res.status === 401) forceSignOut();
    throw new ApiError(res.status, envelope);
  }

  return data as T;
}

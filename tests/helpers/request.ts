import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Mock request factory ─────────────────────────────────────────────────────

export function mockReq(options: {
  method?:  string;
  body?:    unknown;
  query?:   Record<string, string | string[]>;
  headers?: Record<string, string>;
}): VercelRequest {
  return {
    method:  options.method  ?? 'GET',
    body:    options.body    ?? undefined,
    query:   options.query   ?? {},
    headers: options.headers ?? {},
    cookies: {},
  } as unknown as VercelRequest;
}

// ── Mock response factory ────────────────────────────────────────────────────

export interface ResponseState {
  statusCode: number;
  body:       unknown;
  location:   string | null;
  ended:      boolean;
}

/**
 * Returns a { state, res } pair.
 *
 * `state` is a plain object whose properties update as the handler calls
 * res.status(), res.json(), res.redirect(), etc.
 *
 * `res` is a Proxy that implements the subset of VercelResponse the handlers
 * actually use. Method calls chain back to `res` so `.status(200).json(body)`
 * works correctly.
 */
export function mockRes(): { state: ResponseState; res: VercelResponse } {
  const state: ResponseState = {
    statusCode: 200,
    body:       undefined,
    location:   null,
    ended:      false,
  };

  const res = new Proxy({} as VercelResponse, {
    get(_target, prop: string) {
      switch (prop) {
        case 'status':
          return (code: number) => { state.statusCode = code; return res; };
        case 'json':
          return (body: unknown) => { state.body = body; state.ended = true; };
        case 'end':
          return () => { state.ended = true; };
        case 'redirect':
          return (code: number, url: string) => {
            state.statusCode = code;
            state.location   = url;
            state.ended      = true;
          };
        default:
          return () => res;
      }
    },
  });

  return { state, res };
}

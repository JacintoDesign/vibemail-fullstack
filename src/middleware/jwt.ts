import jwt from 'jsonwebtoken';
import { VercelRequest } from '@vercel/node';
import { ProviderError } from '../types/provider';

export interface JwtPayload {
  sub:   string;   // Supabase users.id (UUID)
  email: string;
  name:  string;
  exp:   number;   // Unix timestamp
}

/**
 * Extracts and verifies the Bearer JWT from the Authorization header.
 * Throws ProviderError('UNAUTHORIZED') on any failure so handlers can
 * return the CONTRACT.md error envelope without extra branching.
 */
export function verifyJwt(req: VercelRequest): JwtPayload {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw new ProviderError('UNAUTHORIZED', 'Authorization header is missing or not a Bearer token');
  }

  const token  = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ProviderError('CONFIG_ERROR', 'JWT_SECRET env var is not set');
  }

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    throw new ProviderError('UNAUTHORIZED', 'JWT is missing, malformed, expired, or signature invalid');
  }
}

/**
 * Signs a new HS256 JWT with a 7-day expiry.
 */
export function signJwt(payload: Omit<JwtPayload, 'exp'>): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ProviderError('CONFIG_ERROR', 'JWT_SECRET env var is not set');
  }
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

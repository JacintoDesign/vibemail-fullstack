import crypto from 'crypto';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OAuthTokens, ProviderError } from '../../types/provider';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// ── Supabase (lazy singleton) ────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  _supabase = createClient(url, key);
  return _supabase;
}

// ── OAuth2 client factory ────────────────────────────────────────────────────

export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set',
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ── AES-256-GCM encryption ───────────────────────────────────────────────────
// Ciphertext format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
// ENCRYPTION_KEY must be a 64-character hex string (32 bytes).

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new ProviderError('CONFIG_ERROR', 'ENCRYPTION_KEY env var is not set');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new ProviderError(
      'CONFIG_ERROR',
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV — recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 128-bit tag
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new ProviderError(
      'DECRYPTION_FAILED',
      'Malformed ciphertext — expected iv:authTag:data',
    );
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ── Token persistence ────────────────────────────────────────────────────────

/**
 * Upserts a user row with encrypted tokens.
 * Conflict target: google_id (unique across providers).
 * Returns the Supabase user UUID.
 */
export async function persistTokens(
  googleId: string,
  email: string,
  name: string,
  tokens: OAuthTokens,
): Promise<string> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        google_id: googleId,
        email,
        name,
        encrypted_access_token: encrypt(tokens.accessToken),
        encrypted_refresh_token: encrypt(tokens.refreshToken),
        token_expires_at: tokens.expiresAt ?? null,
      },
      { onConflict: 'google_id' },
    )
    .select('id')
    .single();

  if (error) {
    throw new ProviderError('TOKEN_PERSIST_FAILED', error.message, error);
  }

  return (data as { id: string }).id;
}

/**
 * Updates only the access token fields for an existing user.
 * Called by the tokens event listener on every silent refresh.
 */
export async function updateUserTokens(
  userId: string,
  tokens: Pick<OAuthTokens, 'accessToken' | 'expiresAt'>,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('users')
    .update({
      encrypted_access_token: encrypt(tokens.accessToken),
      token_expires_at: tokens.expiresAt ?? null,
    })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('TOKEN_UPDATE_FAILED', error.message, error);
  }
}

// ── Tokens event listener ────────────────────────────────────────────────────

/**
 * Attaches the googleapis 'tokens' event to a client instance.
 * Fires whenever the client silently refreshes an access token.
 * Decrypts nothing here — the new token arrives in plaintext from googleapis;
 * this function re-encrypts it and writes it back to Supabase immediately.
 */
export function attachTokensListener(client: OAuth2Client, userId: string): void {
  client.on('tokens', (newTokens) => {
    if (!newTokens.access_token) return;
    updateUserTokens(userId, {
      accessToken: newTokens.access_token,
      expiresAt: newTokens.expiry_date ?? undefined,
    }).catch((err: unknown) => {
      // Cannot throw from an EventEmitter callback — log and continue.
      console.error('[gmail:auth] tokens event: failed to persist refreshed token', err);
    });
  });
}

// ── Watch setup ──────────────────────────────────────────────────────────────

/**
 * Registers a Gmail push-notification watch for the authenticated user.
 * Stores history_id and watch_expiry to the users row.
 * watch_resource_id is populated later by the /webhook/gmail receiver
 * (it arrives in the X-Goog-Resource-ID push notification header, not in
 * the watch response).
 */
async function setupWatch(client: OAuth2Client, userId: string): Promise<void> {
  const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topicName) {
    throw new ProviderError('CONFIG_ERROR', 'GOOGLE_PUBSUB_TOPIC env var is not set');
  }

  const gmail = google.gmail({ version: 'v1', auth: client });

  let watchData: { historyId?: string | null; expiration?: string | null };
  try {
    const { data } = await gmail.users.watch({
      userId: 'me',
      requestBody: { topicName },
    });
    watchData = data;
  } catch (err) {
    throw new ProviderError('WATCH_SETUP_FAILED', 'Failed to register Gmail watch', err);
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('users')
    .update({
      history_id: watchData.historyId ?? null,
      watch_expiry: watchData.expiration ? Number(watchData.expiration) : null,
      watch_resource_id: null, // set by /webhook/gmail on first Pub/Sub push
    })
    .eq('id', userId);

  if (error) {
    throw new ProviderError('WATCH_SETUP_FAILED', error.message, error);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates the Google OAuth2 consent URL.
 * Uses access_type=offline and prompt=consent to guarantee a refresh token.
 * Returns the URL and a CSRF state token — caller must store state for
 * validation in exchangeCode.
 */
export async function initiateOAuth(): Promise<{ url: string; state: string }> {
  const client = createOAuth2Client();
  const state = crypto.randomUUID();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  });
  return { url, state };
}

/**
 * Exchanges an authorization code for tokens, encrypts and persists them,
 * attaches the tokens listener, and registers a Gmail watch.
 * Returns OAuthTokens plus the new Supabase userId and the user's email.
 */
export async function exchangeCode(
  code: string,
  _state?: string,
): Promise<OAuthTokens & { userId: string; email: string; name: string }> {
  const client = createOAuth2Client();

  let rawTokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  };
  try {
    const { tokens } = await client.getToken(code);
    rawTokens = tokens;
  } catch (err) {
    throw new ProviderError('TOKEN_EXCHANGE_FAILED', 'Failed to exchange authorization code', err);
  }

  if (!rawTokens.access_token || !rawTokens.refresh_token) {
    throw new ProviderError(
      'TOKEN_EXCHANGE_FAILED',
      'Google did not return both access_token and refresh_token. ' +
        'Ensure access_type=offline and prompt=consent are set on the consent URL.',
    );
  }

  // Fetch the Google profile for google_id, email, and display name.
  client.setCredentials(rawTokens);
  const oauth2Api = google.oauth2({ version: 'v2', auth: client });
  let profile: { id?: string | null; email?: string | null; name?: string | null };
  try {
    const { data } = await oauth2Api.userinfo.get();
    profile = data;
  } catch (err) {
    throw new ProviderError('TOKEN_EXCHANGE_FAILED', 'Failed to fetch Google user profile', err);
  }

  if (!profile.id || !profile.email) {
    throw new ProviderError(
      'TOKEN_EXCHANGE_FAILED',
      'Google profile is missing id or email',
    );
  }

  const tokens: OAuthTokens = {
    accessToken: rawTokens.access_token,
    refreshToken: rawTokens.refresh_token,
    expiresAt: rawTokens.expiry_date ?? undefined,
  };

  const userId = await persistTokens(
    profile.id,
    profile.email,
    profile.name ?? profile.email,
    tokens,
  );

  attachTokensListener(client, userId);
  await setupWatch(client, userId);

  return { ...tokens, userId, email: profile.email, name: profile.name ?? profile.email };
}

/**
 * Fetches the encrypted refresh token from Supabase, decrypts it, and
 * obtains a fresh access token from Google.
 * Persists the new access token back to Supabase before returning.
 */
export async function refreshAccessToken(userId: string): Promise<OAuthTokens> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .select('encrypted_refresh_token, token_expires_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new ProviderError('USER_NOT_FOUND', `No user found for id: ${userId}`, error);
  }

  const row = data as { encrypted_refresh_token: string; token_expires_at: number | null };
  const decryptedRefresh = decrypt(row.encrypted_refresh_token);

  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: decryptedRefresh });

  let newCreds: { access_token?: string | null; expiry_date?: number | null };
  try {
    const { credentials } = await client.refreshAccessToken();
    newCreds = credentials;
  } catch (err) {
    throw new ProviderError('TOKEN_REFRESH_FAILED', 'Failed to refresh access token', err);
  }

  if (!newCreds.access_token) {
    throw new ProviderError('TOKEN_REFRESH_FAILED', 'Google did not return a new access token');
  }

  const refreshed: OAuthTokens = {
    accessToken: newCreds.access_token,
    refreshToken: decryptedRefresh,
    expiresAt: newCreds.expiry_date ?? undefined,
  };

  await updateUserTokens(userId, {
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  });

  return refreshed;
}

/**
 * Loads a fully-configured OAuth2Client for a given user.
 * Fetches and decrypts stored tokens from Supabase, sets credentials,
 * and attaches the tokens listener so any subsequent silent refresh
 * writes the new token back to Supabase automatically.
 * Used by all message-layer functions (Units 3–5).
 */
export async function loadOAuth2Client(userId: string): Promise<OAuth2Client> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new ProviderError('USER_NOT_FOUND', `No user found for id: ${userId}`, error);
  }

  const row = data as {
    encrypted_access_token: string;
    encrypted_refresh_token: string;
    token_expires_at: number | null;
  };

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: decrypt(row.encrypted_access_token),
    refresh_token: decrypt(row.encrypted_refresh_token),
    expiry_date: row.token_expires_at ?? undefined,
  });

  attachTokensListener(client, userId);

  return client;
}

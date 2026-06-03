import crypto from 'crypto';
import { google } from 'googleapis';
import { OAuth2Client, TokenInfo } from 'google-auth-library';
import { OAuthTokens, ProviderError } from '../../types/provider';
import { getClient, getUser, updateUserTokens as dbUpdateUserTokens, updateHistoryId, updateWatchExpiry } from '../../db';
import { runInitialSync } from '../../sync/index';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

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
  const { data, error } = await getClient()
    .from('users')
    .upsert(
      {
        google_id:               googleId,
        email,
        name,
        encrypted_access_token:  encrypt(tokens.accessToken),
        encrypted_refresh_token: encrypt(tokens.refreshToken),
        token_expires_at:        tokens.expiresAt ?? null,
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
 * Encrypts the new token then delegates to the db layer.
 */
export async function updateUserTokens(
  userId: string,
  tokens: Pick<OAuthTokens, 'accessToken' | 'expiresAt'>,
): Promise<void> {
  await dbUpdateUserTokens(userId, {
    encryptedAccessToken: encrypt(tokens.accessToken),
    tokenExpiresAt:       tokens.expiresAt ?? null,
  });
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
 * Always updates watch_expiry. Only updates history_id for new users —
 * returning users keep their existing history_id so the Pub/Sub webhook can
 * call history.list from where it left off and catch up on any emails that
 * arrived while the previous watch was expired.
 */
async function setupWatch(
  client:    OAuth2Client,
  userId:    string,
  isNewUser: boolean,
): Promise<void> {
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

  const expiry = watchData.expiration ? Number(watchData.expiration) : null;
  await updateWatchExpiry(userId, expiry, null);   // watch_resource_id set on first push

  // Only set history_id for new users. The watch response historyId is the
  // Pub/Sub checkpoint: new emails arriving after this point will be delivered
  // via Pub/Sub and fetched via history.list(startHistoryId).
  if (isNewUser && watchData.historyId) {
    await updateHistoryId(userId, watchData.historyId);
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

  // Fetch user identity from the token info endpoint.
  // sub is the immutable Google user ID; name is present when the
  // userinfo.profile scope is granted (not in googleapis TokenInfo types).
  let tokenInfo: TokenInfo & { name?: string };
  try {
    tokenInfo = (await client.getTokenInfo(
      rawTokens.access_token,
    )) as TokenInfo & { name?: string };
  } catch (err) {
    throw new ProviderError('TOKEN_EXCHANGE_FAILED', 'Failed to fetch token info', err);
  }

  if (!tokenInfo.sub || !tokenInfo.email) {
    throw new ProviderError(
      'TOKEN_EXCHANGE_FAILED',
      'Token info is missing required fields: sub, email',
    );
  }

  const tokens: OAuthTokens = {
    accessToken:  rawTokens.access_token,
    refreshToken: rawTokens.refresh_token,
    expiresAt:    rawTokens.expiry_date ?? undefined,
  };

  // Set credentials on the client before watch setup and the token listener.
  client.setCredentials(rawTokens);

  const userId = await persistTokens(
    tokenInfo.sub,
    tokenInfo.email,
    tokenInfo.name ?? tokenInfo.email,
    tokens,
  );

  // Determine if this is a first-time login before setupWatch overwrites state.
  // Returning users keep their existing history_id so the Pub/Sub webhook can
  // resume from where it left off (catching up emails missed while watch was expired).
  const existingUser = await getUser(userId);
  const isNewUser    = !existingUser?.history_id;

  attachTokensListener(client, userId);
  await setupWatch(client, userId, isNewUser);

  // Only run the 50-message seed sync for new users. For returning users the
  // existing DB rows are already populated; Pub/Sub + history.list handles any
  // gap from a lapsed watch.
  if (isNewUser) {
    await runInitialSync(userId);
  }

  return { ...tokens, userId, email: tokenInfo.email, name: tokenInfo.name ?? tokenInfo.email };
}

/**
 * Fetches the encrypted refresh token from Supabase, decrypts it, and
 * obtains a fresh access token from Google.
 * Persists the new access token back to Supabase before returning.
 */
export async function refreshAccessToken(userId: string): Promise<OAuthTokens> {
  const row = await getUser(userId);

  if (!row || !row.encrypted_refresh_token) {
    throw new ProviderError('USER_NOT_FOUND', `No user found for id: ${userId}`);
  }

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
  const row = await getUser(userId);

  if (!row || !row.encrypted_access_token || !row.encrypted_refresh_token) {
    throw new ProviderError('USER_NOT_FOUND', `No user found for id: ${userId}`);
  }

  const client = createOAuth2Client();
  client.setCredentials({
    access_token:  decrypt(row.encrypted_access_token),
    refresh_token: decrypt(row.encrypted_refresh_token),
    expiry_date:   row.token_expires_at ?? undefined,
  });

  attachTokensListener(client, userId);

  return client;
}

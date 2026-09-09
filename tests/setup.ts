/**
 * Jest setupFilesAfterEnv — runs before each test suite.
 *
 * Env vars are already loaded by globalSetup (tests/globalSetup.ts).
 * This file only asserts that the required vars are present so that
 * a missing value produces a clear error before any test module loads.
 *
 * Also stubs POST /functions/v1/embed so ingest-wired paths (webhook,
 * drafts, upsert) never hit the live edge function during tests.
 */

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(
      `[test setup] Missing required env var: ${key}. ` +
      'Add it to .env or .env.test before running the test suite.',
    );
  }
}

const originalFetch = globalThis.fetch.bind(globalThis);
const STUB_EMBEDDING = Array.from({ length: 384 }, () => 0);

beforeAll(() => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes('/functions/v1/embed')) {
      return new Response(JSON.stringify({ embedding: STUB_EMBEDDING }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

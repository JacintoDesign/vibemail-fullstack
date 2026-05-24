/**
 * Jest setupFilesAfterEnv — runs before each test suite.
 *
 * Env vars are already loaded by globalSetup (tests/globalSetup.ts).
 * This file only asserts that the required vars are present so that
 * a missing value produces a clear error before any test module loads.
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

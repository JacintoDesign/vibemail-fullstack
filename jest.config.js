/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  globalSetup: '<rootDir>/tests/globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Exclude Claude Code worktrees from module resolution to prevent hasteMap collisions
  testPathIgnorePatterns: ['/node_modules/', '/.claude/'],
  modulePathIgnorePatterns: ['/.claude/'],
  watchPathIgnorePatterns: ['/.claude/'],
  // 30 s per test — live Supabase roundtrips need headroom
  testTimeout: 30_000,
  clearMocks: true,
  restoreMocks: true,
};

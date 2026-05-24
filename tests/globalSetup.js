/**
 * Jest globalSetup — runs ONCE before any test suite, in the main process,
 * before ts-jest transforms are active (so this file must be plain JS).
 *
 * Loads environment variables from .env.test (if present) or .env so they
 * are guaranteed to be in process.env before any suite's setupFilesAfterEnv
 * fires.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

module.exports = async function globalSetup() {
  const root = findRoot();
  tryLoadEnv(path.join(root, '.env.test'));
  tryLoadEnv(path.join(root, '.env'));
};

function findRoot() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'package.json'))) return cwd;
  return path.resolve(__dirname, '..');
}

function tryLoadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    process.loadEnvFile(filePath);
  } catch {
    // malformed file or already loaded — silently continue
  }
}

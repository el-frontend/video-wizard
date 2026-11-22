import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createAuth } from './config';
import type { db } from '../db';

afterEach(() => vi.unstubAllEnvs());

it('requires an exact trusted origin and a separate secret', () => {
  const secret = randomBytes(32).toString('hex');
  const unusedDatabase = {} as typeof db;
  for (const baseURL of [
    'https://example.test/auth',
    'https://*.example.test',
    'file:///tmp/auth',
  ]) {
    expect(() => createAuth(unusedDatabase, { baseURL, secret })).toThrow();
  }
  const baseURL = 'https://example.test';
  expect(() => createAuth(unusedDatabase, { baseURL, secret: 'too short' })).toThrow();
  vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', 'https://*.example.test');
  expect(() => createAuth(unusedDatabase, { baseURL, secret })).toThrow();
  vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', '');
  vi.stubEnv('STUDIO_RENDER_SECRET', secret);
  expect(() => createAuth(unusedDatabase, { baseURL, secret })).toThrow();
});

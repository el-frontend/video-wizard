import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { signServiceToken, verifyServiceToken } from './index';

const secret = randomBytes(40).toString('hex');
const input = {
  audience: 'video-wizard-renderer' as const,
  scope: 'render.create',
  ownerId: randomUUID(),
  jobId: randomUUID(),
};
it('binds owner, operation, audience and exact five-minute admission', async () => {
  const now = new Date();
  const token = await signServiceToken(input, { secret, now });
  expect(await verifyServiceToken(token, { ...input, secret, now })).toMatchObject(input);
  for (const invalid of [
    { scope: 'render.read' },
    { audience: 'video-wizard-processing' as const },
    { now: new Date(+now + 300000) },
    { secret: randomBytes(32).toString('hex') },
  ])
    await expect(
      verifyServiceToken(token, { ...input, secret, now, ...invalid })
    ).rejects.toThrow();
  await expect(signServiceToken({ ...input, ownerId: 'invalid' }, { secret })).rejects.toThrow();
  await expect(signServiceToken(input, { secret: 'short' })).rejects.toThrow();
});

it('rejects a human EdDSA profile, invalid references and excessive lifetimes', async () => {
  const { SignJWT, generateKeyPair } = await import('jose');
  const now = Math.floor(Date.now() / 1000);
  const base = {
    ownerId: input.ownerId,
    jobId: input.jobId,
    scope: input.scope,
    iss: 'video-wizard-backend',
    sub: 'video-wizard-worker',
    aud: input.audience,
    token_use: 'service',
    iat: now,
    exp: now + 300,
  };
  const key = new TextEncoder().encode(secret);
  for (const override of [
    { jobId: 'bad-id' },
    { token_use: 'user' },
    { exp: now + 301 },
    { iat: now + 300, exp: now + 600 },
    { aud: [input.audience] },
  ]) {
    const token = await new SignJWT({ ...base, ...override })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(key);
    await expect(verifyServiceToken(token, { ...input, secret })).rejects.toThrow();
  }
  const { privateKey } = await generateKeyPair('EdDSA');
  const human = await new SignJWT({ ...base, token_use: 'user' })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .sign(privateKey);
  await expect(verifyServiceToken(human, { ...input, secret })).rejects.toThrow();
});

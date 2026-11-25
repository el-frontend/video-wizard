import { randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, SignJWT } from 'jose';
import { expect, it } from 'vitest';

import { authFixture, authOptions, baseURL, protocol, responseCookie } from './auth-test-fixture';
import { createAuth } from './config';
import { resolveIdentity } from './user-jwt';

it('jwtRejectsRevocationAndInvalidBearerWithCookie', async () => {
  const fixture = await authFixture();
  try {
    const server = createAuth(fixture.db, authOptions);
    const password = 'ﬁ' + randomUUID();
    const email = 'new@example.test';
    const signup = await server.handler(
      protocol('sign-up/email', { name: 'New', email, password })
    );
    expect(signup.status).toBe(200);
    const login = await server.handler(
      protocol('sign-in/email', { email, password: password.normalize('NFKC') })
    );
    expect(login.status).toBe(200);
    const attrs = login.headers
      .getSetCookie()
      .find((v) => v.includes('session_token='))
      ?.split(';')
      .slice(1)
      .join(';')
      .toLowerCase();
    expect(attrs).toContain('httponly');
    expect(attrs).toContain('secure');
    expect(attrs).toContain('samesite=lax');
    const cookie = responseCookie(login);
    const response = await server.handler(protocol('token', undefined, cookie));
    expect(response.status).toBe(200);
    const { token } = await response.json();
    const claims = decodeJwt(token);
    expect(Object.keys(claims).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'sid',
      'sub',
      'token_use',
    ]);
    expect(claims).toMatchObject({ iss: baseURL, aud: 'video-wizard-api', token_use: 'user' });
    expect(claims.exp! - claims.iat!).toBe(900);
    expect(decodeProtectedHeader(token).alg).toBe('EdDSA');
    expect(typeof decodeProtectedHeader(token).kid).toBe('string');
    const resolve = (headers: HeadersInit, method = 'GET') =>
      resolveIdentity(fixture.db, server, new Headers(headers), method);
    expect((await resolve({ authorization: 'Bearer ' + token }))?.user.id).toBe(claims.sub);
    expect((await resolve({ cookie }))?.session.id).toBe(claims.sid);
    expect(await resolve({ cookie, authorization: 'Bearer invalid' })).toBeNull();
    expect(await resolve({ cookie, origin: 'https://other.example.test' }, 'POST')).toBeNull();
    const otherSignup = await server.handler(
      protocol('sign-up/email', {
        name: 'Other',
        email: 'other@example.test',
        password: randomUUID(),
      })
    );
    const other = await resolve({ cookie: responseCookie(otherSignup) });
    expect(other).toBeTruthy();
    const now = Math.floor(Date.now() / 1000);
    for (const override of [
      { aud: 'other-api' },
      { iss: 'https://other.example.test' },
      { token_use: 'service' },
      { iat: now - 1000, exp: now - 100 },
      { sub: 'invalid' },
      { sid: 'invalid' },
      { sub: other!.user.id },
      { sid: other!.session.id },
    ]) {
      const signed = await server.api.signJWT({ body: { payload: { ...claims, ...override } } });
      expect(await resolve({ cookie, authorization: 'Bearer ' + signed.token })).toBeNull();
    }
    const wrongAlgorithm = await new SignJWT(claims)
      .setProtectedHeader({
        alg: 'HS256',
        kid: decodeProtectedHeader(token).kid,
      })
      .sign(randomBytes(32));
    expect(await resolve({ authorization: 'Bearer ' + wrongAlgorithm })).toBeNull();
    const [head, body, signature] = token.split('.');
    const altered = [head, body, (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1)].join('.');
    expect(await resolve({ cookie, authorization: 'Bearer ' + altered })).toBeNull();
    await server.handler(protocol('sign-out', {}, cookie));
    expect(await resolve({ authorization: 'Bearer ' + token })).toBeNull();
    expect(await resolve({ cookie })).toBeNull();
  } finally {
    await fixture.close();
  }
});

it('checks registration boundaries and denies cross-origin signup', async () => {
  const fixture = await authFixture();
  try {
    const server = createAuth(fixture.db, authOptions);
    for (const length of [7, 129]) {
      const r = await server.handler(
        protocol('sign-up/email', {
          name: 'Test',
          email: 'test@example.test',
          password: 'a'.repeat(length),
        })
      );
      expect(r.ok).toBe(false);
    }
    const req = protocol('sign-up/email', {
      name: 'Test',
      email: 'test@example.test',
      password: randomUUID(),
    });
    req.headers.set('origin', 'https://other.example.test');
    expect((await server.handler(req)).status).toBe(403);
  } finally {
    await fixture.close();
  }
});

it('reserves renewal of an aged session for the browser-visible response', async () => {
  const fixture = await authFixture();
  try {
    const server = createAuth(fixture.db, authOptions);
    const signup = await server.handler(
      protocol('sign-up/email', {
        name: 'Renewal',
        email: 'renew@example.test',
        password: randomUUID(),
      })
    );
    const cookie = responseCookie(signup);
    const aged = (
      await fixture.pool.query(
        "UPDATE auth_sessions SET expires_at = now() + interval '5 days' RETURNING id, expires_at"
      )
    ).rows[0];
    const guard = await resolveIdentity(fixture.db, server, new Headers({ cookie }));
    expect(guard?.session.id).toBe(aged.id);
    const expiration = async () =>
      (
        await fixture.pool.query('SELECT expires_at FROM auth_sessions WHERE id=$1', [aged.id])
      ).rows[0].expires_at.getTime();
    expect(await expiration()).toBe(aged.expires_at.getTime());
    const browser = await server.handler(protocol('get-session', undefined, cookie));
    expect(browser.ok).toBe(true);
    expect(
      browser.headers
        .getSetCookie()
        .some((value) => value.includes('session_token=') && /Max-Age=604800/i.test(value))
    ).toBe(true);
    expect(await expiration()).toBeGreaterThan(aged.expires_at.getTime());
  } finally {
    await fixture.close();
  }
});

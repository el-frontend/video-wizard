import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const issuer = 'video-wizard-backend';
const subject = 'video-wizard-worker';
const lifetime = 300;

const audience = z.enum(['video-wizard-renderer', 'video-wizard-processing']);
export type ServiceAudience = z.infer<typeof audience>;
const reference = z.uuid().refine((value) => /^[1-8]$/.test(value[14] ?? ''));
const operation = z.strictObject({
  audience,
  ownerId: reference,
  scope: z.string().regex(/^[a-z][a-z.-]*$/),
  jobId: reference.optional(),
  projectId: reference.optional(),
  previewId: reference.optional(),
  proposalId: reference.optional(),
  rendererJobId: reference.optional(),
  assetId: reference.optional(),
});
export type ServicePrincipal = z.infer<typeof operation>;
export function serviceKey(secret: string) {
  if (!secret || Buffer.byteLength(secret) < 32 || secret === process.env.BETTER_AUTH_SECRET)
    throw new Error('Configura una clave de servicio independiente de al menos 32 bytes.');
  return new TextEncoder().encode(secret);
}
interface Options {
  secret: string;
  now?: Date;
}
export async function signServiceToken(
  input: ServicePrincipal,
  { secret, now = new Date() }: Options
) {
  const { audience, ...claims } = operation.parse(input);
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ ...claims, token_use: 'service' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(issuer)
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt(iat)
    .setExpirationTime(iat + lifetime)
    .setJti(randomUUID())
    .sign(serviceKey(secret));
}
export async function verifyServiceToken(
  token: string,
  requirements: Options & { audience: ServiceAudience; scope: string }
): Promise<ServicePrincipal> {
  const { payload, protectedHeader } = await jwtVerify(token, serviceKey(requirements.secret), {
    algorithms: ['HS256'],
    issuer,
    subject,
    audience: requirements.audience,
    typ: 'JWT',
    currentDate: requirements.now,
    maxTokenAge: lifetime,
    requiredClaims: ['exp', 'iat', 'sub', 'token_use', 'scope', 'ownerId'],
  });
  const { iat, exp, aud, sub: _sub, iss: _iss, jti: _jti, token_use, ...claims } = payload;
  if (
    protectedHeader.typ !== 'JWT' ||
    !Number.isSafeInteger(iat) ||
    exp !== iat! + lifetime ||
    token_use !== 'service' ||
    aud !== requirements.audience ||
    claims.scope !== requirements.scope
  )
    throw new Error('Credencial de servicio no válida.');
  return operation.parse({ ...claims, audience: aud });
}
export async function serviceHeaders(input: ServicePrincipal) {
  const token = await signServiceToken(input, { secret: process.env.STUDIO_RENDER_SECRET ?? '' });
  return { Authorization: 'Bearer ' + token };
}

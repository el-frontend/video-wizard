import { z } from 'zod';
import { betterAuthServer } from '@/auth';

// Temporary adapter for the previous signup form. Forward through the HTTP
// handler so Better Auth still enforces its origin checks and request limits.
export async function signup(request: Request) {
  const input = z
    .object({ email: z.email(), password: z.string(), name: z.string().min(1).optional() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ success: false, error: 'Invalid signup data' }, { status: 400 });
  const { email, password, name } = input.data;
  const response = await betterAuthServer.handler(
    new Request(new URL('/api/auth/sign-up/email', request.url), {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ email, password, name: name ?? email }),
    })
  );
  if (!response.ok)
    return Response.json(
      { success: false, error: 'Failed to create account' },
      { status: response.status }
    );
  const { user } = await response.json();
  const output = Response.json(
    { success: true, data: { id: user.id, email: user.email } },
    { status: 201 }
  );
  for (const cookie of response.headers.getSetCookie()) output.headers.append('set-cookie', cookie);
  return output;
}

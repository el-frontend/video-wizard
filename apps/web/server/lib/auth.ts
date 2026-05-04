import { NextResponse } from 'next/server';

import { auth } from '@/auth';

/**
 * Thrown by `requireAuth` when the request has no valid session.
 * API routes catch this and turn it into a 401 response via
 * `unauthorizedResponse`.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

/**
 * Resolves the current session, throwing UnauthorizedError when no user
 * is signed in. Use at the top of API route handlers that need an owner.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
}

/**
 * Standard 401 response for API routes. Pair with a try/catch on
 * UnauthorizedError thrown by `requireAuth`.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
}

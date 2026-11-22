'use client';

import { createAuthClient } from 'better-auth/react';
import { jwtClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
  plugins: [jwtClient()],
  sessionOptions: { refetchInterval: 300 },
  fetchOptions: { redirect: 'error', credentials: 'same-origin', retry: 0 },
});

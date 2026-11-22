import { toNextJsHandler } from 'better-auth/next-js';
import { betterAuthServer } from '@/auth';

export const { GET, POST } = toNextJsHandler(betterAuthServer);

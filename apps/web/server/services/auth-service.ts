import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { ServiceError, ValidationError } from '@/server/lib/utils';
import { MIN_PASSWORD_LENGTH, hashPassword } from '@/server/lib/password';

export const signupInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  name: z.string().trim().min(1).max(255).optional(),
});

export type SignupInput = z.infer<typeof signupInputSchema>;

export interface SignupResult {
  id: string;
  email: string;
}

/**
 * Authentication service.
 *
 * Owns the password-credential signup flow. Sign-in itself is handled by
 * the Auth.js Credentials provider in `apps/web/auth.ts`, which calls
 * verifyPassword against the hash stored here.
 */
class AuthService {
  async signup(input: unknown): Promise<SignupResult> {
    const parsed = signupInputSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid signup data';
      throw new ValidationError(message);
    }

    const { email, password, name } = parsed.data;

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ValidationError('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);

    const [created] = await db
      .insert(users)
      .values({ email, name, passwordHash })
      .returning({ id: users.id, email: users.email });

    if (!created) {
      throw new ServiceError('Failed to create user');
    }

    return created;
  }
}

export const authService = new AuthService();

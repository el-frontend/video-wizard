import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { randomBytes, randomUUID } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { db } from '../db';
import { authAccounts, users } from '../db/schema';
import { hashPassword } from '../lib/password';
import { provisionCatalog } from '../services/studio/provision-catalog';

interface SeedOptions {
  email: string;
  name: string;
  password?: string;
  credentialFile: string;
}
interface SeedResult {
  userId: string;
  created: boolean;
  credentialFile?: string;
}

async function writeCredential(path: string, email: string, password: string) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // A hard link publishes the complete file atomically and never replaces a previous credential.
  const temporary = join(directory, '.bootstrap-' + randomUUID());
  try {
    await writeFile(temporary, JSON.stringify({ email, password }, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function seedBaseUser(database: typeof db, options: SeedOptions): Promise<SeedResult> {
  const email = z.email().max(320).parse(options.email.trim().toLowerCase());
  const result = await database.transaction(async (tx): Promise<SeedResult> => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) return { userId: existing.id, created: false };
    const name = z.string().trim().min(1).parse(options.name);
    const [created] = await tx
      .insert(users)
      .values({ email, name })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!created) {
      const [winner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!winner) throw new Error('Concurrent seed user no longer exists.');
      return { userId: winner.id, created: false };
    }
    const password = options.password ?? randomBytes(32).toString('base64url');
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new Error('Seed password must contain 8 to 128 characters.');
    }
    await tx.insert(authAccounts).values({
      providerId: 'credential',
      userId: created.id,
      accountId: created.id,
      password: await hashPassword(password),
    });
    if (options.password !== undefined) return { userId: created.id, created: true };
    await writeCredential(options.credentialFile, email, password);
    return { userId: created.id, created: true, credentialFile: options.credentialFile };
  });
  // A catalog/storage failure leaves a usable identity. Re-running provisions the same owner.
  await provisionCatalog(database, result.userId);
  return result;
}

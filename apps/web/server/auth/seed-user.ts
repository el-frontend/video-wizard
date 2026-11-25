import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, unlink } from 'node:fs/promises';
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

const bootstrapFormat = 'video-wizard/bootstrap-user/v1';

async function recoverCredential(path: string, email: string) {
  const invalid = () =>
    new Error('Existing bootstrap file is not a matching private seed credential.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await file.stat();
    if (
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size > 4096 ||
      (process.geteuid && metadata.uid !== process.geteuid())
    )
      throw invalid();
    const content = await file.readFile('utf8');
    let record: unknown;
    try {
      record = JSON.parse(content);
    } catch {
      throw invalid();
    }
    const parsed = z
      .strictObject({
        format: z.literal(bootstrapFormat),
        email: z.literal(email),
        password: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      })
      .safeParse(record);
    if (!parsed.success) throw invalid();
    return parsed.data.password;
  } finally {
    await file.close();
  }
}

async function generatedCredential(path: string, email: string): Promise<string> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString('base64url');
  const temporary = join(directory, '.bootstrap-' + randomUUID());
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(
      JSON.stringify({ format: bootstrapFormat, email, password }, null, 2) + '\n'
    );
    await file.sync();
    // Publish atomically. A previous run may have published before its DB commit.
    try {
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return await recoverCredential(path, email);
    }
    return password;
  } finally {
    try {
      await file.close();
    } finally {
      await unlink(temporary);
    }
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
    const password = options.password ?? (await generatedCredential(options.credentialFile, email));
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
    return { userId: created.id, created: true, credentialFile: options.credentialFile };
  });
  // A catalog/storage failure leaves a usable identity. Re-running provisions the same owner.
  await provisionCatalog(database, result.userId);
  return result;
}

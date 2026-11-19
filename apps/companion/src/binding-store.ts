import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, realpath, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { BindingSchema, SessionIdSchema, type Binding } from './protocol';

export class SessionBusyError extends Error {}

export class BindingStore {
  private constructor(
    readonly workspace: string,
    private readonly directory: string
  ) {}

  static async open({
    workspace,
    dataDir = process.env.STUDIO_DATA_DIR,
  }: {
    workspace: string;
    dataDir?: string;
  }): Promise<BindingStore> {
    const root = await realpath(workspace);
    return new BindingStore(root, resolve(root, dataDir || '.studio-data/companion'));
  }

  async create(provider: Binding['provider'], sessionId: string): Promise<Binding> {
    const binding = BindingSchema.parse({
      id: randomUUID(),
      provider,
      sessionId,
      workspace: this.workspace,
      createdAt: new Date().toISOString(),
    });
    const directory = join(this.directory, 'bindings');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `${binding.id}.tmp`);
    await writeFile(temporary, JSON.stringify(binding) + '\n', { flag: 'wx', mode: 0o600 });
    try {
      await link(temporary, join(directory, `${binding.id}.json`));
    } finally {
      await unlink(temporary);
    }
    return binding;
  }

  async get(id: string): Promise<Binding | null> {
    const file = join(this.directory, 'bindings', `${z.uuid().parse(id)}.json`);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    );
    if (!handle) return null;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0)
        throw new Error('Invalid binding permissions');
      const binding = BindingSchema.parse(JSON.parse(await handle.readFile('utf8')));
      if (binding.id !== id || binding.workspace !== this.workspace) {
        throw new Error('Binding does not match the requested workspace and ID');
      }
      return binding;
    } finally {
      await handle.close();
    }
  }

  async exclusiveSession<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
    const normalizedId = SessionIdSchema.parse(sessionId);
    const locks = join(this.directory, 'locks');
    await mkdir(locks, { recursive: true, mode: 0o700 });
    const file = join(locks, `${normalizedId}.lock`);
    const handle = await open(file, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST')
        throw new SessionBusyError('Claude session already owned by the companion');
      throw error;
    });
    try {
      await handle.writeFile(`${process.pid}\n`);
      return await action();
    } finally {
      await handle.close();
      await unlink(file);
    }
  }
}

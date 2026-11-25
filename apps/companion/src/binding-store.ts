import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { privateDir } from './private-files';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { rendererMediaDirectory } from './renderer-media.mjs';
import { z } from 'zod';
import { BindingSchema, SessionIdSchema, type Binding } from './protocol';

const StoredBindingSchema = BindingSchema.extend({
  claudeExecution: z.enum(['verified', 'organization-rejected']).optional(),
});
type StoredBinding = z.infer<typeof StoredBindingSchema>;

export class SessionBusyError extends Error {}

// Resolve symlinked parents even when the final directory has not been created yet.
async function canonicalDirectory(path: string): Promise<string> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(await canonicalDirectory(dirname(path)), basename(path));
  }
  return realpath(path);
}
function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}
export class BindingStore {
  private constructor(
    readonly workspace: string,
    readonly directory: string
  ) {}

  static async open({
    workspace,
    dataDir = process.env.STUDIO_COMPANION_DIR,
  }: {
    workspace: string;
    dataDir?: string;
  }): Promise<BindingStore> {
    const root = await realpath(workspace);
    const directory = resolve(root, dataDir || '.studio/companion');
    const mounts = new Set([
      rendererMediaDirectory(root),
      resolve(root, process.env.STUDIO_DATA_DIR || '.studio-data'),
    ]);
    const checkLocation = async (candidate: string) => {
      for (const mount of mounts) {
        const media = await canonicalDirectory(mount);
        if (
          candidate === root ||
          contains(media, candidate) ||
          contains(candidate, media) ||
          contains(mount, directory) ||
          contains(directory, mount)
        )
          throw Error('El companion requiere un directorio privado fuera de medios.');
      }
    };
    await checkLocation(await canonicalDirectory(directory));
    const resolved = await privateDir(directory);
    // Creating a previously missing path can reveal aliases on case-insensitive volumes.
    await checkLocation(resolved);
    return new BindingStore(root, resolved);
  }

  async migrate(id: string, legacyDirectory: string) {
    const source = new BindingStore(this.workspace, await realpath(legacyDirectory));
    const old = await source.readBinding(id);
    if (!old) throw Error('No se encontró el vínculo privado anterior.');
    const current = await this.readBinding(id);
    if (!current) {
      await this.writeBinding(old, false);
    }
    const verified = await this.readBinding(id);
    if (JSON.stringify(verified) !== JSON.stringify(old))
      throw Error('La migración del vínculo no coincide.');
    return (await this.get(id))!;
  }

  async create(provider: Binding['provider'], sessionId: string): Promise<Binding> {
    return this.createBinding(provider, sessionId);
  }

  async createVerifiedClaudeBinding(sessionId: string): Promise<Binding> {
    return this.createBinding('claude', sessionId, 'verified');
  }

  private async createBinding(
    provider: Binding['provider'],
    sessionId: string,
    claudeExecution?: StoredBinding['claudeExecution']
  ): Promise<Binding> {
    const binding = BindingSchema.parse({
      id: randomUUID(),
      provider,
      sessionId,
      workspace: this.workspace,
      createdAt: new Date().toISOString(),
    });
    await this.writeBinding({ ...binding, claudeExecution }, false);
    return binding;
  }

  private async writeBinding(binding: StoredBinding, replace: boolean): Promise<void> {
    const directory = join(this.directory, 'bindings');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `${binding.id}.json`);
    const temporary = join(directory, `${binding.id}.${randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(JSON.stringify(binding) + '\n');
      } finally {
        await handle.close();
      }
      if (replace) await rename(temporary, file);
      else await link(temporary, file);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  async get(id: string): Promise<Binding | null> {
    const stored = await this.readBinding(id);
    if (!stored) return null;
    const { claudeExecution: _claudeExecution, ...binding } = stored;
    return binding;
  }

  async getClaudeExecution(binding: Binding): Promise<StoredBinding['claudeExecution']> {
    return (await this.readClaudeBinding(binding))?.claudeExecution;
  }

  async recordClaudeOrganizationRejection(binding: Binding): Promise<void> {
    const stored = await this.readClaudeBinding(binding);
    if (!stored) throw new Error('Claude binding not found');
    await this.writeBinding({ ...stored, claudeExecution: 'organization-rejected' }, true);
  }

  private async readClaudeBinding(binding: Binding) {
    const stored = await this.readBinding(binding.id);
    if (
      stored?.provider === 'claude' &&
      binding.provider === 'claude' &&
      binding.workspace === this.workspace &&
      stored.sessionId === binding.sessionId
    )
      return stored;
  }

  private async readBinding(id: string): Promise<StoredBinding | null> {
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
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
        throw new Error('Invalid binding permissions');
      const binding = StoredBindingSchema.parse(JSON.parse(await handle.readFile('utf8')));
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

import { constants } from 'node:fs';
import { open, mkdir, realpath, rename, lstat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
export async function privateJson(path: string): Promise<unknown> {
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await fd.stat();
    if (
      !info.isFile() ||
      info.mode & 0o077 ||
      info.uid !== process.getuid?.() ||
      info.size > 1024 * 1024
    )
      throw Error('Se requiere un archivo privado.');
    return JSON.parse(await fd.readFile('utf8'));
  } finally {
    await fd.close();
  }
}
export async function privateDir(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = await realpath(directory),
    info = await lstat(directory);
  if (!info.isDirectory() || info.mode & 0o077 || info.uid !== process.getuid?.())
    throw Error('El directorio del companion debe ser privado y canónico.');
  return path;
}
export async function savePrivate(directory: string, name: string, value: unknown) {
  await privateDir(directory);
  const path = join(directory, name),
    temp = path + '.' + randomUUID() + '.tmp';
  const file = await open(temp, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(value) + '\n');
    await file.sync();
    await file.close();
    await rename(temp, path);
  } finally {
    await file.close().catch(() => {});
    await unlink(temp).catch(() => {});
  }
}

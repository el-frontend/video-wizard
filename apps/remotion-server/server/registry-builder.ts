import { verifyModule } from '@workspace/render-contract/component-bundle';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type ExportSnapshot,
  libraryKey,
  remotionCaptionPresets,
} from '@workspace/render-contract';
import type { LibraryEntry } from '@workspace/video-project';

const require = createRequire(import.meta.url);
export const compositionsDirectory = dirname(require.resolve('@workspace/remotion-compositions'));
export const serverModules = resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules');
const archive = resolve(compositionsDirectory, '../studio-presets/v1');
export const hashBytes = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

export async function verifiedSeed(
  snapshot: ExportSnapshot,
  entry: Extract<LibraryEntry, { kind: 'component' | 'template' }>
) {
  if (
    entry.engine !== 'remotion' ||
    !entry.manifest.builtin ||
    Object.keys(entry.manifest.props).length
  )
    throw new Error('Componente incompatible con el registro Remotion.');
  const { source: name } = remotionCaptionPresets[entry.manifest.builtin.preset];
  const pin = snapshot.bundles[libraryKey(entry)];
  if (!pin) throw new Error('Falta el código del componente fijado.');
  const bytes = Buffer.from(pin.base64, 'base64');
  if (
    pin.sha256 !== hashBytes(bytes) ||
    pin.sha256 !== hashBytes(await readFile(join(archive, name + '.tsx.txt')))
  ) {
    throw new Error('El código no corresponde a un preset verificado.');
  }
  return { bytes, name, hash: pin.sha256 };
}

export async function buildRegistry(snapshot: ExportSnapshot, workspace: string) {
  if (snapshot.document.engine !== 'remotion') throw new Error('El proyecto requiere otro motor.');
  const root = join(workspace, 'registry');
  await mkdir(join(root, 'templates'), { recursive: true });
  const types = await readFile(join(archive, 'types.ts.txt'));
  await writeFile(join(root, 'types.ts'), types);
  const imports: string[] = [],
    registrations: string[] = [],
    hashes = [hashBytes(types)];
  const modules = new Map<string, string>();
  for (const entry of Object.values(snapshot.dependencies.libraries).sort((a, b) =>
    libraryKey(a) < libraryKey(b) ? -1 : 1
  )) {
    if (entry.kind !== 'component') continue;
    if ('schemaVersion' in entry.manifest) {
      const pin = snapshot.bundles[libraryKey(entry)];
      if (!pin) throw Error('Falta el módulo fijado.');
      const sealed = verifyModule(Buffer.from(pin.base64, 'base64'), entry.manifest, pin.sha256);
      registrations.push(
        '[' +
          JSON.stringify(libraryKey(entry)) +
          ',' +
          JSON.stringify({ sourceHash: sealed.sourceHash }) +
          ']'
      );
      hashes.push(sealed.moduleHash);
      modules.set(sealed.moduleHash, sealed.module);
      continue;
    }
    const { bytes, hash, name } = await verifiedSeed(snapshot, entry);
    await writeFile(join(root, 'templates', hash + '.tsx'), bytes);
    const alias = 'Preset' + imports.length;
    imports.push('import { ' + name + ' as ' + alias + ' } from "./templates/' + hash + '";');
    registrations.push('[' + JSON.stringify(libraryKey(entry)) + ', ' + alias + ']');
    hashes.push(hash);
  }
  const source =
    imports.join('\n') +
    '\nexport const registry = Object.fromEntries([' +
    registrations.join(',') +
    ']);\n';
  const entry = join(root, 'index.ts');
  await writeFile(entry, source);
  return { entry, modules, hash: hashBytes(JSON.stringify([source, ...hashes])) };
}

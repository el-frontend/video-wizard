import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ComponentManifestSchema,
  SourceFilesSchema,
  type ComponentSource,
} from '@workspace/video-project';
import {
  digest,
  componentSourceHash,
  hostVersions,
  type SealedModule,
} from '@workspace/render-contract/component-bundle';

export async function compileComponent(
  input: ComponentSource,
  signal?: AbortSignal
): Promise<SealedModule> {
  const manifest = ComponentManifestSchema.parse(input.manifest),
    files = SourceFilesSchema.parse(input.files);
  if (!Object.hasOwn(files, manifest.entry)) throw Error('No se encuentra el archivo de entrada.');
  const sourceHash = componentSourceHash({ manifest, files });
  const directory = await mkdtemp(join(tmpdir(), 'studio-compiler-'));
  try {
    const module = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=192',
          fileURLToPath(new URL('./component-compiler-child.mjs', import.meta.url)),
        ],
        {
          cwd: directory,
          env: { NODE_ENV: 'production', LANG: 'C', TMPDIR: directory },
          stdio: ['pipe', 'pipe', 'ignore'],
          signal: AbortSignal.any([AbortSignal.timeout(12000), ...(signal ? [signal] : [])]),
        }
      );
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
        if (output.length > 400000) child.kill('SIGKILL');
      });
      child.on('error', () => reject(Error('La compilación se interrumpió.')));
      child.on('close', (code) => {
        if (code !== 0) return reject(Error('El compilador superó los límites.'));
        try {
          const result = JSON.parse(output);
          if (typeof result.module === 'string') resolve(result.module);
          else reject(Error(String(result.error).slice(0, 1000)));
        } catch {
          reject(Error('Resultado de compilación no válido.'));
        }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ manifest, files, sourceHash }));
    });
    return {
      abi: 1,
      host: hostVersions[manifest.engine],
      manifest,
      sourceHash,
      moduleHash: digest(module),
      module,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseEnv } from 'node:util';

export function rendererMediaDirectory(workspace, webEnv) {
  if (webEnv === undefined) {
    try {
      webEnv = parseEnv(readFileSync(join(workspace, 'apps/web/.env.local'), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const path = webEnv?.STUDIO_DATA_DIR || join(workspace, '.studio-data');
  if (!isAbsolute(path)) throw Error('STUDIO_DATA_DIR must be absolute.');
  return path;
}

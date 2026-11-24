import type { ExportSnapshot } from '@workspace/render-contract';
export function checkMounted(
  snapshot: ExportSnapshot,
  workspace: string,
  dataDir: string | undefined,
  signal: AbortSignal,
  focus?: string[]
): Promise<{
  diagnostics: [];
  samples: { frame: number; sha256: string }[];
  moduleHashes: string[];
}>;

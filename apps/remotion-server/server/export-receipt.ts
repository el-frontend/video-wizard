import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RenderResult } from '@workspace/render-contract';
import { resolveStudioDataDir } from '@workspace/render-contract/storage';
import type { ServicePrincipal } from '@workspace/service-auth';

export interface ExportReceipt {
  ownerId: string;
  projectId: string;
  attemptId: string;
  snapshotHash: string | null;
  status: 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: RenderResult;
  error?: string;
  retryable?: boolean;
}

export function attemptDirectory(p: ServicePrincipal) {
  const root =
    process.env.STUDIO_EXPORT_STAGING || join(resolveStudioDataDir(), 'export-runtime', 'staging');
  return join(root, p.jobId!, p.attemptId!);
}
export function publicReceipt({ ownerId: _owner, projectId: _project, ...receipt }: ExportReceipt) {
  return receipt;
}
export const isTerminal = (r: ExportReceipt) =>
  ['completed', 'failed', 'cancelled'].includes(r.status);

// A complete private record becomes visible in one filesystem operation. First admission is exclusive,
// including DELETE before POST. The renderer owns this staging directory through its lifecycle.
export async function writeReceipt(path: string, receipt: ExportReceipt, first = false) {
  const target = path + '.admitted';
  if (first) await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const tmp = target + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(tmp, JSON.stringify(receipt), { flag: 'wx', mode: 0o600, flush: true });
    if (first) await link(tmp, target);
    else await rename(tmp, target);
  } finally {
    await rm(tmp, { force: true });
  }
}

export async function readReceipt(path: string): Promise<ExportReceipt | 'legacy' | undefined> {
  try {
    const data = await readFile(path + '.admitted', 'utf8');
    // Pre-receipt releases stored only the digest. Never replay or disclose a legacy admission.
    if (/^[a-f0-9]{64}$/.test(data)) return 'legacy';
    return JSON.parse(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

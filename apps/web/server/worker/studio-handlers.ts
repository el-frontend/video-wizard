import { setTimeout as delay } from 'node:timers/promises';
import type { RenderResult } from '@workspace/render-contract';
import { snapshotDigest, verifyRenderResult } from '@workspace/render-contract/export';
import type { ClaimedTask } from '../services/queue-service';
import {
  exportsService,
  storedExport,
  InvalidExport,
  ExportAttemptFailure,
} from '../services/studio/export-service';
import { preparePublication, removeStoppedWorkspace } from '../services/studio/export-files';
import { internal, StudioRenderError } from '../services/studio/remotion-service';

function remote(
  claim: ClaimedTask,
  scope: 'export.create' | 'export.read' | 'export.cancel',
  signal: AbortSignal,
  attemptId = claim.task.attemptId!
) {
  const { snapshot, snapshotHash, projectId } = storedExport(claim.job);
  return internal(
    claim.job.userId,
    { scope, jobId: claim.job.id, projectId, attemptId },
    '/studio/export-attempts/' + attemptId,
    scope === 'export.create' ? { snapshot, snapshotHash } : undefined,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      release: scope === 'export.cancel',
    }
  );
}
export async function runStudioExport(
  claim: ClaimedTask,
  options: { signal: AbortSignal; onProgress: (percent: number) => void }
): Promise<RenderResult> {
  const input = storedExport(claim.job);
  if (!claim.task.attemptId || snapshotDigest(input.snapshot) !== input.snapshotHash)
    throw new InvalidExport('La instantánea guardada no coincide con su hash.');
  const { signal, onProgress } = options;
  // The attempt UUID is durable before POST. If the acknowledgement is lost, query this exact ID.
  try {
    await (await remote(claim, 'export.create', signal)).body?.cancel();
  } catch {
    signal.throwIfAborted();
  }
  let admitted = false;
  let outages = 0;
  for (;;) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await remote(claim, 'export.read', signal);
      outages = 0;
    } catch (e) {
      signal.throwIfAborted();
      if ((e instanceof StudioRenderError && e.status === 404) || ++outages >= 3) throw e;
      await delay(500, undefined, { signal });
      continue;
    }
    const state = await response.json();
    if (state.attemptId !== claim.task.attemptId || state.snapshotHash !== input.snapshotHash)
      throw Error('Recibo de intento no válido.');
    if (!admitted) {
      await exportsService.receipt(claim);
      admitted = true;
    }
    if (state.status === 'completed') return verifyRenderResult(input.snapshot, state.result);
    if (state.status === 'failed' && typeof state.error === 'string')
      throw state.retryable
        ? new ExportAttemptFailure(state.error)
        : new InvalidExport(state.error);
    if (!['running', 'queued'].includes(state.status))
      throw Error('El motor no pudo completar este intento.');
    if (Number.isFinite(state.progress)) onProgress(state.progress * 100);
    await delay(400, undefined, { signal });
  }
}

export async function processStudioExport(claim: ClaimedTask) {
  const { job, task } = claim;
  const stopRemote = async (attemptId = task.attemptId!) => {
    await (
      await remote(claim, 'export.cancel', AbortSignal.timeout(10000), attemptId)
    ).body?.cancel();
  };
  if (claim.cancelLeaseId) {
    let stopped = false;
    try {
      await stopRemote();
      stopped = true;
    } finally {
      await exportsService.finishAttempt(claim, undefined, stopped);
      if (stopped) await removeStoppedWorkspace(job.id, task.attemptId!);
    }
    return;
  }
  const controller = new AbortController();
  const watcher = new AbortController();
  let progress = 0;
  const monitor = (async () => {
    while (!watcher.signal.aborted) {
      await delay(750, undefined, { signal: watcher.signal });
      await exportsService.heartbeat(claim, progress);
    }
  })().catch((e) => {
    if (!watcher.signal.aborted) controller.abort(e);
  });
  let ready: Awaited<ReturnType<typeof preparePublication>> | undefined;
  let stopped = false;
  try {
    // A crashed worker may have left its previous renderer running in a scheduler slot.
    if (claim.previousAttemptId) {
      try {
        await stopRemote(claim.previousAttemptId);
        await removeStoppedWorkspace(job.id, claim.previousAttemptId);
      } catch {
        /* An unreachable renderer retires itself; leave its private files for reconciliation. */
      }
    }
    const result = await runStudioExport(claim, {
      signal: controller.signal,
      onProgress: (p) => {
        progress = p;
      },
    });
    stopped = true;
    const { snapshot, snapshotHash } = storedExport(job);
    ready = await preparePublication(
      job.userId,
      job.id,
      task.attemptId!,
      snapshot,
      snapshotHash,
      result,
      controller.signal
    );
    controller.signal.throwIfAborted();
    await exportsService.promote(claim, ready.published, ready.rename);
  } catch (e) {
    try {
      await stopRemote();
      stopped = true;
    } catch {
      /* Renderer watchdog retires disconnected executions. Do not delete a live workspace. */
    }
    await exportsService.finishAttempt(claim, e, stopped);
  } finally {
    watcher.abort();
    await monitor;
    await ready?.cleanup();
    if (stopped) await removeStoppedWorkspace(job.id, task.attemptId!);
  }
}

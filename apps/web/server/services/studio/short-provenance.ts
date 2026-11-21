import { z } from 'zod';
import type { Diagnostic, PlaybackVariant, ProjectDraft } from '@workspace/video-project';
import { OwnedClipInputSchema } from '@/server/types/clip-render';
import type { Job } from '../job-history-service';

const resultSchema = z.object({ sourceAssetId: z.uuid(), derivedAssetId: z.uuid() });
export function completedCrop(job: Job | null) {
  if (!job || job.type !== 'clip_creation' || job.status !== 'completed') return null;
  const input = OwnedClipInputSchema.safeParse(job.inputData),
    result = resultSchema.safeParse(job.resultData);
  if (!input.success || !result.success || input.data.sourceAssetId !== result.data.sourceAssetId)
    return null;
  const variant: PlaybackVariant = {
    kind: 'processed-crop',
    jobId: job.id,
    assetId: result.data.derivedAssetId,
    sourceStartMs: input.data.startMs,
    sourceEndMs: input.data.endMs,
  };
  return { sourceAssetId: input.data.sourceAssetId, variant };
}
export function matchesCrop(job: Job | null, sourceId: string, v: PlaybackVariant) {
  const crop = completedCrop(job);
  return (
    crop?.sourceAssetId === sourceId &&
    crop.variant.assetId === v.assetId &&
    crop.variant.sourceStartMs === v.sourceStartMs &&
    crop.variant.sourceEndMs === v.sourceEndMs
  );
}

/** Recheck imported or edited documents against the owner's completed worker receipts. */
export async function cropDiagnostics(owner: string, document: ProjectDraft) {
  const diagnostics: Diagnostic[] = [];
  const variants = document.scenes.flatMap((scene) =>
    scene.layers.flatMap((layer) =>
      layer.type === 'video' && layer.playbackVariant
        ? [{ sceneId: scene.id, layer, variant: layer.playbackVariant }]
        : []
    )
  );
  if (!variants.length) return diagnostics;
  const { jobHistoryService } = await import('../job-history-service');
  const jobs = new Map(
    await Promise.all(
      [...new Set(variants.map((v) => v.variant.jobId))].map(
        async (id) => [id, await jobHistoryService.getById(id, owner)] as const
      )
    )
  );
  for (const { sceneId, layer, variant } of variants)
    if (!matchesCrop(jobs.get(variant.jobId) ?? null, layer.assetId, variant))
      diagnostics.push({
        severity: 'error',
        code: 'crop-provenance',
        sceneId,
        layerId: layer.id,
        message: 'El trabajo no acredita este recorte. Usa el video original.',
      });
  return diagnostics;
}

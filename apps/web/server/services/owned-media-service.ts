import { UNKNOWN_RENDER_ADMISSION } from './render-admission';
import { OwnedClipInputSchema } from '@/server/types/clip-render';
import { z } from 'zod';
import type { AssetRecord } from '@workspace/video-project';
import { db } from '@/server/db';
import { BrandKitSchema } from '@/features/video/types/brand-kit';
import { legacyMsToSeconds } from '@/features/video/lib/legacy-timing';
import { ValidationError } from '@/server/lib/utils';
import {
  SubtitleSegmentSchema,
  type OwnedMediaDescriptor,
  type OwnedVideoDescriptor,
} from '@/server/types/video-render';
import { AssetNotFoundError, AssetService } from './studio/asset-service';
import { completedCrop } from './studio/short-provenance';
import { measuredVideo } from './studio/short-service';
import { jobHistoryService, type Job } from './job-history-service';

export const reingest =
  'No se puede verificar el origen de este trabajo. Vuelve a importar el video.';
const assets = new AssetService(db);
const refs = { sourceAssetId: z.uuid().optional(), jobId: z.uuid().optional() };
type MediaRef = { sourceAssetId?: string; jobId?: string };
const oneRef = (ref: MediaRef) => Boolean(ref.sourceAssetId) !== Boolean(ref.jobId);
export const transcriptionInput = z
  .strictObject({
    ...refs,
    language: z.string().min(1).max(32).nullish(),
  })
  .refine(oneRef);
const caption = SubtitleSegmentSchema.omit({ id: true }).extend({ id: z.number().optional() });
export const renderInput = z
  .strictObject({
    ...refs,
    subtitles: z.array(caption),
    sourceDurationMs: z.number().positive().optional(),
    template: z
      .enum([
        'default',
        'viral',
        'minimal',
        'modern',
        'hormozi',
        'highlight',
        'colorshift',
        'mrbeast',
        'mrbeastemoji',
      ])
      .default('viral'),
    aspectRatio: z.enum(['9:16', '4:5', '16:9', '1:1']).default('9:16'),
    language: z.string().max(32).default('en'),
    brandKit: BrandKitSchema.strict().optional(),
  })
  .refine(oneRef);
export const storedRenderInput = renderInput.safeExtend({
  subtitleClock: z.enum(['seconds', 'milliseconds']),
});

async function ownedJob(owner: string, id: string) {
  const job = await jobHistoryService.getById(id, owner);
  if (!job) throw new AssetNotFoundError();
  return job;
}

const transcriptReceipt = z.object({
  sourceAssetId: z.uuid(),
  subtitles: z.array(caption),
  language: z.string(),
  sourceDurationMs: z.number().positive(),
  videoDuration: z.number().positive(),
  totalSegments: z.int(),
});
function completedTranscript(job: Job) {
  const input = transcriptionInput.safeParse(job.inputData);
  const result = transcriptReceipt.safeParse(job.resultData);
  if (
    job.type === 'transcription' &&
    job.status === 'completed' &&
    input.success &&
    input.data.sourceAssetId &&
    result.success &&
    input.data.sourceAssetId === result.data.sourceAssetId
  )
    return result.data;
  return null;
}

async function jobVideo(owner: string, job: Job) {
  const crop = completedCrop(job);
  if (crop) {
    const [original, derived] = await Promise.all([
      assets.get(owner, crop.sourceAssetId),
      assets.get(owner, crop.variant.assetId),
    ]);
    const { sourceStartMs, sourceEndMs } = crop.variant;
    if (
      sourceEndMs > measuredVideo(original) ||
      measuredVideo(derived) < sourceEndMs - sourceStartMs ||
      (original.hasAudio && !derived.hasAudio)
    )
      throw new ValidationError(reingest);
    return derived;
  }
  const transcript = completedTranscript(job);
  if (!transcript) throw new ValidationError(reingest);
  return assets.get(owner, transcript.sourceAssetId);
}

export async function resolveOwnedVideo(
  owner: string,
  ref: MediaRef
): Promise<OwnedVideoDescriptor> {
  if (!oneRef(ref)) throw new ValidationError(reingest);
  const record = ref.jobId
    ? await jobVideo(owner, await ownedJob(owner, ref.jobId))
    : await assets.get(owner, ref.sourceAssetId!);
  return { ...mediaDescriptor(record), durationMs: measuredVideo(record) };
}

function mediaDescriptor({
  id,
  hash,
  mediaType,
  width,
  height,
  hasAudio,
}: AssetRecord): OwnedMediaDescriptor {
  return { assetId: id, hash, mediaType, width, height, hasAudio };
}

export async function resolveBrand(owner: string, kit?: z.infer<typeof BrandKitSchema>) {
  if (!kit) return {};
  const { logoAssetId, ...brandKit } = kit;
  if (!logoAssetId) return { brandKit };
  const logo = await assets.get(owner, logoAssetId);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(logo.mediaType))
    throw new ValidationError('Selecciona una imagen PNG, JPEG o WebP como logo.');
  return { brandKit, logoAsset: mediaDescriptor(logo) };
}

const renderReceipt = z.object({ sourceAssetId: z.uuid(), outputAssetId: z.uuid() });
export async function editorMedia(owner: string, jobId: string) {
  const job = await ownedJob(owner, jobId);
  const render = storedRenderInput.safeParse(job.inputData);
  if (job.type === 'render' && job.status === 'completed' && render.success) {
    const source = await resolveOwnedVideo(owner, render.data);
    if (renderReceipt.safeParse(job.resultData).data?.sourceAssetId !== source.assetId)
      throw new ValidationError(reingest);
    return {
      sourceAssetId: source.assetId,
      sourceDurationMs: source.durationMs,
      subtitles: renderCaptions(render.data),
    };
  }
  const source = await jobVideo(owner, job);
  return {
    sourceAssetId: source.id,
    sourceDurationMs: measuredVideo(source),
    subtitles: legacyMsToSeconds(completedTranscript(job)?.subtitles ?? []),
  };
}

export function renderCaptions(input: z.infer<typeof storedRenderInput>) {
  return input.subtitleClock === 'milliseconds'
    ? legacyMsToSeconds(input.subtitles)
    : input.subtitles.map((caption, index) => ({ ...caption, id: index + 1 }));
}

/** Historical receipts can contain engine locators. Project responses from proven identifiers. */
export function publicJob(job: Job) {
  if (job.type === 'analysis') return job;
  const input =
    job.type === 'render'
      ? storedRenderInput.safeParse(job.inputData)
      : job.type === 'transcription'
        ? transcriptionInput.safeParse(job.inputData)
        : OwnedClipInputSchema.safeParse(job.inputData);
  const summary = {
    ...job,
    inputData: input.success ? input.data : null,
    resultData: null,
    errorMessage:
      job.errorMessage === UNKNOWN_RENDER_ADMISSION
        ? UNKNOWN_RENDER_ADMISSION + ' ID: ' + job.id
        : job.errorMessage
          ? 'No se pudo completar el trabajo. Vuelve a intentarlo.'
          : null,
  };
  if (!input.success) return { ...summary, errorMessage: reingest };
  if (job.status !== 'completed') return summary;
  const crop = completedCrop(job);
  if (crop) {
    const result = z
      .object({
        sourceDurationMs: z.number().positive().nullish(),
        duration: z.number().optional(),
        crop_dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
        file_size: z.number().optional(),
      })
      .safeParse(job.resultData);
    return {
      ...summary,
      resultData: {
        ...result.data,
        success: true,
        start_time: crop.variant.sourceStartMs / 1000,
        end_time: crop.variant.sourceEndMs / 1000,
        sourceAssetId: crop.sourceAssetId,
        derivedAssetId: crop.variant.assetId,
        output_url: '/api/studio/assets/' + crop.variant.assetId,
      },
    };
  }
  const transcript = completedTranscript(job);
  if (transcript) return { ...summary, resultData: transcript };
  const render = renderReceipt.safeParse(job.resultData);
  if (job.type === 'render' && render.success)
    return {
      ...summary,
      resultData: {
        ...render.data,
        jobId: job.id,
        videoUrl: '/api/studio/assets/' + render.data.outputAssetId,
      },
    };
  return { ...summary, errorMessage: reingest };
}

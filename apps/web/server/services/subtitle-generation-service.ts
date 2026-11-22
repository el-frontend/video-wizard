import { renderAdmission, UnknownRenderAdmissionError } from './render-admission';
import type { LegacyRenderAdmission } from '@/server/types/video-render';
import type { ReadableStream } from 'node:stream/web';
import { z } from 'zod';
import { db } from '@/server/db';
import { durationFrames, secondsToLegacyMs } from '@/features/video/lib/legacy-timing';
import { toLegacySeconds } from '@/features/studio-shorts/lib/timing';
import {
  resolveOwnedVideo,
  resolveBrand,
  renderCaptions,
  type storedRenderInput,
  type transcriptionInput,
} from './owned-media-service';
import { AssetService } from './studio/asset-service';
import { shortSource } from './studio/shorts';

const assets = new AssetService(db);
export class SubtitleGenerationService {
  constructor(
    private readonly renderOrigin = process.env.REMOTION_SERVER_URL || 'http://localhost:3001'
  ) {}

  async transcribe(owner: string, input: z.infer<typeof transcriptionInput>) {
    const source = await resolveOwnedVideo(owner, input);
    const { cues, language } = await shortSource.transcribe(
      owner,
      source.assetId,
      input.language ?? undefined
    );
    const segments = toLegacySeconds(cues);
    return {
      sourceAssetId: source.assetId,
      sourceDurationMs: source.durationMs,
      segments,
      full_text: segments.map((segment) => segment.text).join(' '),
      language: language ?? input.language ?? 'en',
      segment_count: segments.length,
    };
  }

  async generateSubtitles(owner: string, input: z.infer<typeof transcriptionInput>) {
    const result = await this.transcribe(owner, input);
    return {
      sourceAssetId: result.sourceAssetId,
      subtitles: secondsToLegacyMs(result.segments),
      language: result.language,
      totalSegments: result.segment_count,
      sourceDurationMs: result.sourceDurationMs,
      videoDuration: result.sourceDurationMs,
    };
  }

  async render(
    owner: string,
    webJobId: string,
    input: z.infer<typeof storedRenderInput>,
    onProgress?: (pct: number) => Promise<void>
  ) {
    const sourceAsset = await resolveOwnedVideo(owner, input);
    const { brandKit, logoAsset } = await resolveBrand(owner, input.brandKit);
    const admission: LegacyRenderAdmission = {
      compositionId: 'VideoWithSubtitles',
      webJobId,
      sourceAsset,
      logoAsset,
      inputProps: {
        subtitles: renderCaptions(input),
        template: input.template,
        language: input.language,
        aspectRatio: input.aspectRatio,
        backgroundColor: '#000000',
        durationInFrames: durationFrames(sourceAsset.durationMs, 30),
        brandKit,
      },
    };
    let jobId = await renderAdmission.reserve(owner, webJobId);
    if (!jobId) {
      try {
        const response = await fetch(this.renderOrigin + '/renders', {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(admission),
        });
        if (!response.ok) throw new UnknownRenderAdmissionError();
        jobId = z.object({ jobId: z.uuid() }).parse(await response.json()).jobId;
      } catch {
        // Once the request has left this process, a failed response cannot establish non-admission.
        throw new UnknownRenderAdmissionError();
      }
      // If this write loses its acknowledgement, a retry rereads the durable receipt.
      await renderAdmission.accept(owner, webJobId, jobId);
    }
    const resource = this.renderOrigin + '/renders/' + jobId;
    let lastProgress = -1;
    for (let attempt = 0; attempt < 900; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const status = await fetch(resource, { redirect: 'error', cache: 'no-store' });
      if (!status.ok) throw new Error('No se pudo consultar la exportación.');
      const receipt = await status.json();
      if (receipt.status === 'failed' || receipt.status === 'cancelled')
        throw new Error('La exportación falló.');
      if (receipt.status === 'completed') {
        // The renderer controls its receipt URL. Only fetch this exact job's fixed artifact.
        const file = await fetch(resource + '.mp4', { redirect: 'error', cache: 'no-store' });
        if (!file.ok || !file.body) throw new Error('No se pudo recuperar la exportación.');
        const output = await assets.ingest(owner, {
          filename: webJobId + '.mp4',
          mediaType: 'video/mp4',
          stream: file.body as ReadableStream<Uint8Array>,
        });
        return {
          jobId: webJobId,
          sourceAssetId: sourceAsset.assetId,
          outputAssetId: output.id,
          videoUrl: '/api/studio/assets/' + output.id,
        };
      }
      if (receipt.status === 'in-progress' && typeof receipt.progress === 'number' && onProgress) {
        const percent = Math.round(receipt.progress * 100);
        if (percent !== lastProgress) {
          lastProgress = percent;
          // The renderer already accepted this job. A progress write cannot invalidate it.
          try {
            await onProgress(percent);
          } catch {
            console.warn('Could not record render progress.');
          }
        }
      }
    }
    throw new Error('Se agotó el tiempo de exportación.');
  }
}
export const subtitleGenerationService = new SubtitleGenerationService();

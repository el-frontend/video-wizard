import { openAsBlob } from 'node:fs';
import type { ReadableStream } from 'node:stream/web';
import { AssetDescriptorSchema } from '@workspace/video-project';
import { ValidationError } from '@/server/lib/utils';
import { sourceCues } from '@/features/studio-shorts/lib/timing';
import type { ClipIntegrationService } from '../clip-integration-service';
import { OwnedClipInputSchema } from '@/server/types/clip-render';
import type { z } from 'zod';
import type { AssetService } from './asset-service';
import { measuredVideo } from './short-service';

export class ShortSourceService {
  constructor(
    private assets: Pick<AssetService, 'get' | 'resolveFile' | 'ingest'>,
    private python: Pick<
      ClipIntegrationService,
      'downloadYouTube' | 'transcribeSource' | 'cropSource' | 'openProcessedCrop'
    >
  ) {}
  async download(owner: string, url: string) {
    const { filename, mediaType, stream } = await this.python.downloadYouTube(url);
    const asset = await this.assets.ingest(owner, {
      filename,
      mediaType,
      stream: stream as ReadableStream<Uint8Array>,
    });
    return AssetDescriptorSchema.strip().parse(asset);
  }
  private async openSource(owner: string, asset: { id: string; mediaType: string }) {
    const path = await this.assets.resolveFile(owner, asset.id);
    const blob = await openAsBlob(path, { type: asset.mediaType });
    return new File([blob], 'source', { type: asset.mediaType });
  }
  async validateClip(owner: string, input: z.infer<typeof OwnedClipInputSchema>) {
    const asset = await this.assets.get(owner, input.sourceAssetId);
    if (input.endMs > measuredVideo(asset))
      throw new ValidationError('El tramo excede la duración medida del video.');
    return asset;
  }
  async renderClip(owner: string, input: z.infer<typeof OwnedClipInputSchema>) {
    const source = await this.validateClip(owner, input);
    const result = await this.python.cropSource(await this.openSource(owner, source), input);
    const filename = /^output\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.mp4)$/.exec(
      result.output_path ?? ''
    )?.[1];
    if (
      !result.success ||
      !filename ||
      result.output_url !== '/output/' + filename ||
      result.start_time !== input.startMs / 1000 ||
      result.end_time !== input.endMs / 1000
    )
      throw Error('El procesador no confirmó el recorte solicitado.');
    const stream = await this.python.openProcessedCrop(filename);
    const derived = await this.assets.ingest(owner, {
      filename,
      mediaType: 'video/mp4',
      stream: stream as ReadableStream<Uint8Array>,
    });
    if (
      measuredVideo(derived) < input.endMs - input.startMs ||
      (source.hasAudio && !derived.hasAudio)
    )
      throw Error('El archivo procesado no cubre el intervalo o su audio.');
    return {
      success: true,
      output_url: '/api/studio/assets/' + derived.id,
      duration: result.duration,
      start_time: result.start_time,
      end_time: result.end_time,
      crop_dimensions: result.crop_dimensions,
      file_size: result.file_size,
      sourceAssetId: source.id,
      derivedAssetId: derived.id,
      sourceDurationMs: derived.durationMs,
    };
  }
  async transcribe(owner: string, assetId: string, language?: string) {
    const asset = await this.assets.get(owner, assetId),
      duration = measuredVideo(asset);
    if (!asset.hasAudio) return { cues: [], language: null };
    try {
      const result = await this.python.transcribeSource(
        await this.openSource(owner, asset),
        language
      );
      return { cues: sourceCues(result.segments, duration), language: result.language ?? null };
    } catch {
      throw new ValidationError(
        'No se pudo transcribir el audio. Reintenta o crea los fragmentos sin subtítulos.'
      );
    }
  }
}

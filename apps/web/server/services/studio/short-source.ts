import { randomUUID } from 'node:crypto';
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
      'uploadVideo' | 'downloadYouTube' | 'transcribeVideo' | 'createClip' | 'openProcessedCrop'
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
  async prepare(owner: string, assetId: string) {
    const asset = await this.assets.get(owner, assetId);
    measuredVideo(asset);
    const path = await this.assets.resolveFile(owner, assetId);
    const extension =
      asset.mediaType === 'video/quicktime'
        ? '.mov'
        : asset.mediaType === 'video/webm'
          ? '.webm'
          : '.mp4';
    const filename = randomUUID() + extension;
    const blob = await openAsBlob(path, { type: asset.mediaType });
    const receipt = await this.python.uploadVideo(
      new File([blob], filename, { type: asset.mediaType })
    );
    if (receipt.filename !== filename || receipt.path !== 'uploads/' + filename)
      throw new ValidationError('El procesador no pudo preparar el video de origen.');
    return receipt.path;
  }
  async validateClip(owner: string, input: z.infer<typeof OwnedClipInputSchema>) {
    const asset = await this.assets.get(owner, input.sourceAssetId);
    if (input.endMs > measuredVideo(asset))
      throw new ValidationError('El tramo excede la duración medida del video.');
    return asset;
  }
  async renderClip(owner: string, input: z.infer<typeof OwnedClipInputSchema>) {
    const source = await this.validateClip(owner, input);
    const video_path = await this.prepare(owner, source.id);
    const filename = randomUUID() + '.mp4',
      output_path = 'output/' + filename;
    const result = await this.python.createClip({
      video_path,
      output_path,
      start_time: input.startMs / 1000,
      end_time: input.endMs / 1000,
      crop_mode: input.crop_mode,
      aspect_ratio: input.aspect_ratio,
    });
    if (
      !result.success ||
      result.output_path !== output_path ||
      result.output_url !== '/' + output_path ||
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
      ...result,
      sourceAssetId: source.id,
      derivedAssetId: derived.id,
      sourceDurationMs: derived.durationMs,
    };
  }
  async transcribe(owner: string, assetId: string) {
    const asset = await this.assets.get(owner, assetId),
      duration = measuredVideo(asset);
    if (!asset.hasAudio) return { cues: [], language: null };
    try {
      const path = await this.prepare(owner, assetId);
      const result = await this.python.transcribeVideo(path);
      return { cues: sourceCues(result.segments, duration), language: result.language ?? null };
    } catch {
      throw new ValidationError(
        'No se pudo transcribir el audio. Reintenta o crea los fragmentos sin subtítulos.'
      );
    }
  }
}

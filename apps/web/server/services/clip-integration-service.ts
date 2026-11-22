import { ClipRenderResponseSchema, TranscriptionResponseSchema } from '@/server/types/clip-render';
import { extractVideoId } from '@/features/video/lib/youtube';
import { ValidationError, logger } from '@/server/lib/utils';
export class ClipIntegrationService {
  constructor(
    private readonly baseUrl = process.env.PYTHON_ENGINE_INTERNAL_URL || 'http://localhost:8000'
  ) {}

  private async postStudioSource(
    operation: 'transcribe-source' | 'crop-source',
    file: File,
    fields: Record<string, string> = {}
  ) {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const response = await fetch(this.baseUrl + '/studio/' + operation, {
      method: 'POST',
      body: form,
      redirect: 'error',
    });
    if (!response.ok) throw Error('El procesador no pudo completar la operación.');
    return response.json();
  }

  async transcribeSource(file: File, language?: string) {
    return TranscriptionResponseSchema.parse(
      await this.postStudioSource(
        'transcribe-source',
        file,
        language && language !== 'auto' ? { language } : {}
      )
    );
  }

  async cropSource(
    file: File,
    input: { startMs: number; endMs: number; crop_mode: string; aspect_ratio: string }
  ) {
    const response = await this.postStudioSource('crop-source', file, {
      start_ms: String(input.startMs),
      end_ms: String(input.endMs),
      crop_mode: input.crop_mode,
      aspect_ratio: input.aspect_ratio,
    });
    return ClipRenderResponseSchema.parse(response);
  }

  async openProcessedCrop(filename: string) {
    if (!/^[0-9a-f-]{36}\.mp4$/.test(filename)) throw Error('Invalid internal output name');
    const response = await fetch(this.baseUrl + '/output/' + filename, { redirect: 'error' });
    if (!response.ok || !response.body) throw Error('No se pudo leer el recorte procesado.');
    return response.body;
  }

  async downloadYouTube(url: string) {
    const id = extractVideoId(url);
    if (!id) throw new ValidationError('Introduce un enlace de video de YouTube válido.');
    try {
      const response = await fetch(this.baseUrl + '/download-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=' + id }),
      });
      if (!response.ok) throw Error('Download failed: ' + response.status);
      const { filename, path } = await response.json();
      if (
        typeof filename !== 'string' ||
        !filename.startsWith('yt_' + id + '_') ||
        !/^yt_[A-Za-z0-9_-]{11}_[a-f0-9]{8}\.mp4$/.test(filename) ||
        path !== 'uploads/' + filename
      )
        throw Error('Unexpected download receipt');
      const file = await fetch(this.baseUrl + '/uploads/' + filename, { redirect: 'error' });
      if (!file.ok || !file.body) throw Error('Downloaded source is missing');
      return { filename, stream: file.body, mediaType: 'video/mp4' };
    } catch (cause) {
      logger.error('YouTube source download failed', cause);
      throw new ValidationError(
        'No se pudo descargar el video de YouTube. Reintenta o carga el archivo original.'
      );
    }
  }
}

export const clipIntegrationService = new ClipIntegrationService();

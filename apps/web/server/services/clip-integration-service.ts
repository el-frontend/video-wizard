import { TranscriptionResponseSchema } from '@/server/types/clip-render';
import { extractVideoId } from '@/features/video/lib/youtube';
import { ValidationError, logger } from '@/server/lib/utils';
import type {
  ClipRenderRequest,
  ClipRenderResponse,
  TranscriptionResponse,
} from '@/server/types/clip-render';

/**
 * Clip Integration Service
 *
 * Integrates with Python processing-engine backend
 * Handles communication with /render-clip and /transcribe endpoints.
 *
 * Two URL flavors:
 * - `baseUrl`   — used by server-side fetch calls. Resolves the Python
 *                 service in-network when running inside Docker, or via
 *                 localhost on host dev.
 * - `publicUrl` — used by `getVideoUrl()`. The result is sent to the
 *                 browser, so it must be a host-routable URL.
 */
export class ClipIntegrationService {
  private readonly baseUrl: string;
  private readonly publicUrl: string;

  constructor(baseUrl?: string, publicUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.PYTHON_ENGINE_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL ||
      'http://localhost:8000';
    this.publicUrl =
      publicUrl ||
      process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL ||
      process.env.PYTHON_ENGINE_INTERNAL_URL ||
      'http://localhost:8000';
  }

  /**
   * Create a vertical clip from a video segment
   * Calls Python backend /render-clip endpoint
   *
   * @param request - Clip render parameters
   * @returns Clip metadata with output URL
   */
  async createClip(request: ClipRenderRequest): Promise<ClipRenderResponse> {
    try {
      logger.info('Creating clip via Python service', {
        start_time: request.start_time,
        end_time: request.end_time,
        crop_mode: request.crop_mode,
      });

      const response = await fetch(`${this.baseUrl}/render-clip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Clip creation failed');
      }

      const result = await response.json();

      logger.info('Clip created successfully', {
        output_url: result.output_url,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      logger.error('Clip creation failed', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create clip');
    }
  }

  /**
   * Transcribe a video to get timestamped subtitles
   * Calls Python backend /transcribe endpoint
   *
   * @param videoPath - Path to video file
   * @param language - Optional language code
   * @returns Transcription with segments
   */
  async transcribeVideo(videoPath: string, language?: string): Promise<TranscriptionResponse> {
    try {
      logger.info('Transcribing video via Python service', { videoPath });

      const response = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_path: videoPath,
          language,
          cleanup: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Transcription failed');
      }

      const result = TranscriptionResponseSchema.parse(await response.json());

      logger.info('Transcription complete', {
        segment_count: result.segment_count,
      });

      return result;
    } catch (error) {
      logger.error('Transcription failed', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to transcribe video');
    }
  }

  /**
   * Upload video to Python service
   *
   * @param file - Video file to upload
   * @returns Upload result with file path
   */
  async uploadVideo(file: File): Promise<{ path: string; filename: string }> {
    try {
      logger.info('Uploading video to Python service', {
        filename: file.name,
        size: file.size,
      });

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const result = await response.json();

      logger.info('Video uploaded successfully', {
        path: result.path,
      });

      return result;
    } catch (error) {
      logger.error('Video upload failed', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to upload video');
    }
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

  /**
   * Get full video URL from Python service
   * Converts relative path to a browser-routable absolute URL.
   */
  getVideoUrl(relativePath: string): string {
    if (relativePath.startsWith('http')) {
      return relativePath;
    }
    return `${this.publicUrl}${relativePath}`;
  }
}

// Singleton instance — env-driven via the constructor.
export const clipIntegrationService = new ClipIntegrationService();

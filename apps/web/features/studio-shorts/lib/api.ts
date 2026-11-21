import type { AssetDescriptor, CaptionCue, ProjectRecord } from '@workspace/video-project';
import { uploadEditorAsset } from '@/features/studio-designer/hooks/use-editor-dependencies';
import { projectRequest } from '@/features/studio-projects/project-api';
export function shortsRequest<T>(data: unknown, signal?: AbortSignal) {
  return projectRequest<T>('/api/studio/shorts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}
export function registerSource(input: File | string, signal: AbortSignal) {
  return typeof input === 'string'
    ? shortsRequest<AssetDescriptor>({ action: 'download', url: input }, signal)
    : uploadEditorAsset(input, signal);
}
export function transcribeSource(assetId: string, signal?: AbortSignal) {
  return shortsRequest<{ cues: CaptionCue[]; language: string | null }>(
    { action: 'transcribe', assetId },
    signal
  );
}
export function openClipJob(
  jobId: string,
  canvas: ProjectRecord['document']['canvas'],
  clipCaptions: CaptionCue[]
) {
  return shortsRequest<ProjectRecord>({
    action: 'open-job',
    input: { jobId, engine: 'remotion', canvas, clipCaptions },
  });
}

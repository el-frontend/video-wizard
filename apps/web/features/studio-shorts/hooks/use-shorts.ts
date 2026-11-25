'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  AssetDescriptor,
  CaptionCue,
  EngineId,
  LibraryRef,
  ProjectRecord,
} from '@workspace/video-project';
import { registerSource, shortsRequest, transcribeSource } from '../lib/api';
import type { ShortRange } from '../lib/timing';
import { notifyProjectSaved } from '@/features/studio-projects/project-api';

export function useShorts() {
  const [asset, setAsset] = useState<AssetDescriptor>(),
    [cues, setCues] = useState<CaptionCue[]>([]);
  const [transcribed, setTranscribed] = useState(false),
    [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  async function run(label: string, work: (signal: AbortSignal) => Promise<void>) {
    if (flight.current) return;
    const controller = new AbortController();
    flight.current = controller;
    setBusy(label);
    setError('');
    try {
      await work(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      if (flight.current === controller) {
        flight.current = null;
        if (!controller.signal.aborted) setBusy('');
      }
    }
  }
  function load(input: File | string) {
    return run('Preparando video…', async (signal) => {
      const result = await registerSource(input, signal);
      if (!result.mediaType.startsWith('video/') || !result.durationMs)
        throw Error('Selecciona un archivo de video con duración medida.');
      if (!signal.aborted) {
        setAsset(result);
        setCues([]);
        setTranscribed(false);
        setProjects([]);
      }
    });
  }
  function transcribe() {
    if (!asset?.hasAudio) return;
    return run('Transcribiendo audio…', async (signal) => {
      const result = await transcribeSource(asset.id, signal);
      if (!signal.aborted) {
        setCues(result.cues);
        setTranscribed(true);
      }
    });
  }
  function create(
    ranges: (ShortRange & {
      crop: { fit: 'cover' | 'contain'; focalPoint: { x: number; y: number } };
    })[],
    engine: EngineId,
    canvas: ProjectRecord['document']['canvas'],
    templateRef?: LibraryRef
  ) {
    if (!asset) return;
    return run('Creando proyectos…', async (signal) => {
      const created = await shortsRequest<ProjectRecord[]>(
        {
          action: 'create',
          input: {
            assetId: asset.id,
            sourceCaptions: cues,
            ranges,
            engine,
            canvas,
            templateRef,
          },
        },
        signal
      );
      if (!signal.aborted) {
        setProjects(created);
        if (created[0]) notifyProjectSaved(created[0].ownerId);
      }
    });
  }
  function reset() {
    if (flight.current) return;
    setAsset(undefined);
    setCues([]);
    setTranscribed(false);
    setProjects([]);
    setError('');
  }
  return { asset, cues, transcribed, projects, busy, error, load, transcribe, create, reset };
}

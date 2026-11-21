import type { EngineId, Diagnostic } from '@workspace/video-project';
import type { ExportSnapshot } from './snapshot';

export * from './snapshot';
export type { Diagnostic, PreviewHandle } from '@workspace/video-project';

export interface PreparedComposition {
  engine: EngineId;
  workspace: string;
  entry: string;
  manifestHash: string;
}
export interface Artifact {
  kind: 'snapshot' | 'video';
  relativePath: string;
  sha256: string;
}
export interface RenderResult {
  artifacts: Artifact[];
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}
export interface RenderOptions {
  signal: AbortSignal;
  onProgress: (progress: number) => void;
}
export interface EngineAdapter {
  validate(snapshot: ExportSnapshot): Promise<Diagnostic[]>;
  prepare(snapshot: ExportSnapshot, workspace: string): Promise<PreparedComposition>;
  snapshots(
    prepared: PreparedComposition,
    timesMs: number[],
    signal: AbortSignal
  ): Promise<Artifact[]>;
  render(prepared: PreparedComposition, options: RenderOptions): Promise<RenderResult>;
}
export * from './appearance';
export * from './project-appearance';
export * from './remotion-caption-presets';
export * from './scene-frames';

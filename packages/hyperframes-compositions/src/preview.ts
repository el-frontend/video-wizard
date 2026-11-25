import type { ExportSnapshot } from '@workspace/render-contract';
import { compileProject } from './compiler';

export class NativePreviewSession {
  constructor(
    private readonly workspace: string,
    private readonly frameUrl: string,
    private readonly options: { signal: AbortSignal; dataDir?: string }
  ) {}

  async createPreview(snapshot: ExportSnapshot): Promise<{ url: string; manifestHash: string }> {
    const prepared = await compileProject(snapshot, this.workspace, {
      ...this.options,
      preview: true,
    });
    return { url: this.frameUrl, manifestHash: prepared.manifestHash };
  }
}

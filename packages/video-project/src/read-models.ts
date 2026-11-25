import { AssetRecordSchema, type AssetRecord } from './library';
import type { ProjectDraft, ProjectRecord } from './schema';

export type ProjectSummary = Pick<
  ProjectDraft,
  'id' | 'title' | 'engine' | 'canvas' | 'durationMs'
> &
  Pick<ProjectRecord, 'revision' | 'updatedAt'>;

export interface ProjectPage {
  items: ProjectSummary[];
  nextCursor: string | null;
}

export const AssetDescriptorSchema = AssetRecordSchema.omit({ locator: true });
export type AssetDescriptor = Omit<AssetRecord, 'locator'>;

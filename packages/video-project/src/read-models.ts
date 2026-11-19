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

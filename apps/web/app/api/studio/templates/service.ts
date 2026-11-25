import { db } from '@/server/db';
import { TemplateService } from '@/server/services/studio/template-service';
import { AssetService } from '@/server/services/studio/asset-service';
import { ProjectService } from '@/server/services/studio/project-service';
import { LibraryService } from '@/server/services/studio/library-service';
export const templateService = new TemplateService(
  new LibraryService(db),
  new ProjectService(db),
  new AssetService(db)
);

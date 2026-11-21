import { db } from '@/server/db';
import { clipIntegrationService } from '../clip-integration-service';
import { jobHistoryService } from '../job-history-service';
import { LibraryService } from './library-service';
import { ProjectService } from './project-service';
import { TemplateService } from './template-service';
import { AssetService } from './asset-service';
import { ShortService } from './short-service';
import { ShortSourceService } from './short-source';
const assets = new AssetService(db),
  projects = new ProjectService(db);
export const shortSource = new ShortSourceService(assets, clipIntegrationService);
export const shorts = new ShortService(
  assets,
  projects,
  new TemplateService(new LibraryService(db), projects, assets),
  jobHistoryService
);

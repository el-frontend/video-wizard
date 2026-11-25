import { join } from 'node:path';
import { requireAuth } from '@/server/lib/auth';
import { exportsService } from '@/server/services/studio/export-service';
import { publishedDirectory } from '@/server/services/studio/export-files';
import { openAssetFile, streamAssetFile } from '@/server/services/studio/asset-paths';
import { studioResponse } from '../../../../projects/http';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await params;
    const owner = (await requireAuth(request)).id;
    const job = await exportsService.get(owner, id);
    if (!job.attemptId || !job.artifacts.some((a) => a.name === name))
      return new Response(null, { status: 404 });
    const { file, stat } = await openAssetFile(
      join(publishedDirectory(owner, job.projectId, job.revision, id, job.attemptId), name)
    );
    const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': name.endsWith('.png')
        ? 'image/png'
        : name.endsWith('.mp4')
          ? 'video/mp4'
          : 'application/json',
      'Content-Length': String(stat.size),
      'Content-Disposition': 'attachment; filename="' + job.revision + '-' + name + '"',
    };
    if (request.method === 'HEAD') {
      await file.close();
      return new Response(null, { headers });
    }
    return new Response(streamAssetFile(file, 0, Number(stat.size) - 1), { headers });
  } catch (e) {
    return studioResponse(async () => {
      throw e;
    });
  }
}
export const HEAD = GET;

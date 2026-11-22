import { NextResponse } from 'next/server';
import { AssetDescriptorSchema } from '@workspace/video-project';
import { assetResponse, assetService } from '../../http';

export const runtime = 'nodejs';

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return assetResponse(request, async (ownerId) => {
    const { id } = await params;
    const asset = await assetService.get(ownerId, id);
    return NextResponse.json(
      { success: true, data: AssetDescriptorSchema.strip().parse(asset) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  });
}

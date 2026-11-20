import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { AssetDescriptorSchema } from '@workspace/video-project';
import { NextResponse } from 'next/server';

import { ValidationError } from '@/server/lib/utils';

import { assetResponse, assetService } from './http';

export const runtime = 'nodejs';

export function POST(request: Request) {
  return assetResponse(async (ownerId) => {
    const mediaType = request.headers.get('content-type');
    const encodedName = request.headers.get('x-studio-filename');
    if (!request.body || !mediaType || !encodedName) {
      throw new ValidationError('Envía los bytes del archivo, su nombre y su tipo.');
    }
    let filename: string;
    try {
      filename = decodeURIComponent(encodedName);
    } catch {
      throw new ValidationError('El nombre del archivo no está codificado correctamente.');
    }
    const asset = await assetService.ingest(ownerId, {
      stream: request.body as NodeReadableStream<Uint8Array>,
      filename,
      mediaType,
    });
    const descriptor = AssetDescriptorSchema.strip().parse(asset);
    return NextResponse.json({ success: true, data: descriptor }, { status: 201 });
  });
}

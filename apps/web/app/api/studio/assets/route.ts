import { actionResponse, isAttempt, requests } from '../companion/http';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { AssetDescriptorSchema } from '@workspace/video-project';
import { NextResponse } from 'next/server';

import { ValidationError } from '@/server/lib/utils';

import { assetResponse, assetService } from './http';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return assetResponse(request, async (ownerId) => {
    const params = new URL(request.url).searchParams;
    const data = await assetService.list(
      ownerId,
      params.get('cursor') ?? undefined,
      params.get('media') ?? undefined
    );
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  });
}

export function POST(request: Request) {
  if (isAttempt(request))
    return actionResponse(
      request,
      undefined,
      ['voice'],
      (token) => requests.upload(token, uploadBody(request)),
      undefined,
      201
    );
  return assetResponse(request, async (ownerId) => {
    const asset = await assetService.ingest(ownerId, uploadBody(request));
    const descriptor = AssetDescriptorSchema.strip().parse(asset);
    return NextResponse.json({ success: true, data: descriptor }, { status: 201 });
  });
}
function uploadBody(request: Request) {
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
  return { stream: request.body as NodeReadableStream<Uint8Array>, filename, mediaType };
}

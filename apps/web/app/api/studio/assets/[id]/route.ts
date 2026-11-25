import { NextResponse } from 'next/server';

import { streamAssetFile } from '@/server/services/studio/asset-paths';

import { assetResponse, assetService } from '../http';

export const runtime = 'nodejs';

type AssetContext = { params: Promise<{ id: string }> };

function parseRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]!);
    if (suffix === BigInt(0)) return null;
    return { start: suffix >= length ? 0 : Number(length - suffix), end: size - 1 };
  }

  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : BigInt(size - 1);
  if (start >= length || end < start) return null;
  return { start: Number(start), end: end >= length ? size - 1 : Number(end) };
}

function disposition(mediaType: string, name: string) {
  const mode = mediaType === 'application/json' ? 'attachment' : 'inline';
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${mode}; filename*=UTF-8''${encoded}`;
}

export function GET(request: Request, { params }: AssetContext) {
  return assetResponse(request, async (ownerId) => {
    const { id } = await params;
    const { asset, file, size } = await assetService.openFile(ownerId, id);
    const rangeHeader = request.headers.get('range');
    const range = rangeHeader === null ? null : parseRange(rangeHeader, size);
    const baseHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    };

    if (rangeHeader !== null && !range) {
      await file.close();
      if (request.method === 'HEAD')
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
        });
      return NextResponse.json(
        { success: false, error: 'El rango de bytes no es válido.' },
        {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
        }
      );
    }

    const headers = {
      ...baseHeaders,
      'Content-Type': asset.mediaType,
      'Content-Disposition': disposition(asset.mediaType, asset.name),
      'Content-Length': String(range ? range.end - range.start + 1 : size),
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    };
    const status = range ? 206 : 200;
    if (request.method === 'HEAD') {
      await file.close();
      return new Response(null, { status, headers });
    }
    return new Response(streamAssetFile(file, range?.start ?? 0, range?.end ?? size - 1), {
      status,
      headers,
    });
  });
}

export const HEAD = GET;

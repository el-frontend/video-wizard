import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetDescriptorSchema, AssetRecordSchema } from '@workspace/video-project';

import { requireAuth, UnauthorizedError } from '@/server/lib/auth';
import { openStudioTestDb } from '@/test/studio-db';

import { AssetNotFoundError, AssetService } from './asset-service';

vi.mock('@/server/lib/auth', () => ({
  requireAuth: vi.fn(),
  UnauthorizedError: class extends Error {},
}));

let ownerId: string;
let otherOwnerId: string;
let directory: string;
let assets: AssetService;
let audio: Buffer;
let measuredDurationMs: number;
let database: Awaited<ReturnType<typeof openStudioTestDb>>;
let GET: typeof import('@/app/api/studio/assets/[id]/route').GET;
let POST: typeof import('@/app/api/studio/assets/route').POST;

async function uploadAudio(filename = 'voz cubana.mp3') {
  return assets.ingest(ownerId, {
    stream: Readable.from([audio.subarray(0, 100), audio.subarray(100)]),
    filename,
    mediaType: 'audio/mpeg',
  });
}

function preview(id: string, range?: string) {
  return GET(
    new Request(`http://localhost/api/studio/assets/${id}`, {
      headers: range === undefined ? undefined : { Range: range },
    }),
    { params: Promise.resolve({ id }) }
  );
}

function asOwner(id: string) {
  vi.mocked(requireAuth).mockResolvedValue({ id, email: null, name: null, image: null });
}

beforeAll(async () => {
  database = await openStudioTestDb();
  vi.doMock('@/server/db', () => ({ db: database.db }));
  ({ GET } = await import('@/app/api/studio/assets/[id]/route'));
  ({ POST } = await import('@/app/api/studio/assets/route'));
  directory = await mkdtemp(join(tmpdir(), 'studio-assets-integration-'));
  const path = join(directory, 'voz cubana.mp3');
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2.3',
      '-c:a',
      'libmp3lame',
      path,
    ],
    { timeout: 30000 }
  );
  const duration = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8', timeout: 30000 }
  );
  measuredDurationMs = Math.round(Number(duration) * 1000);
  audio = await readFile(path);
});

beforeEach(async () => {
  ownerId = await database.createOwner();
  otherOwnerId = await database.createOwner();
  const dataDir = await mkdtemp(join(directory, 'data-'));
  vi.stubEnv('STUDIO_DATA_DIR', dataDir);
  assets = new AssetService(database.db, dataDir);
  asOwner(ownerId);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  try {
    if (directory) await rm(directory, { recursive: true, force: true });
  } finally {
    await database?.close();
  }
});

describe('AssetService', () => {
  it('paginates only the owner’s descriptors by stable ID and excludes storage paths', async () => {
    for (let i = 0; i < 27; i++)
      await assets.ingest(ownerId, {
        mediaType: 'application/json',
        filename: 'f' + i + '.json',
        stream: Readable.from([JSON.stringify(i)]),
      });
    const audio = await uploadAudio();
    await assets.ingest(otherOwnerId, {
      mediaType: 'application/json',
      filename: 'foreign.json',
      stream: Readable.from(['42']),
    });
    const first = await assets.list(ownerId);
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).toBe(first.items.at(-1)!.id);
    const next = await assets.list(ownerId, first.nextCursor!);
    expect(next.items).toHaveLength(3);
    expect(next.nextCursor).toBe(null);
    const rows = [...first.items, ...next.items];
    expect(rows.every((r) => r.ownerId === ownerId && !('locator' in r))).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(rows.map((r) => r.id).sort());
    expect(new Set(rows.map((r) => r.id)).size).toBe(28);
    expect((await assets.list(ownerId, undefined, 'audio')).items.map((r) => r.id)).toEqual([
      audio.id,
    ]);
  });
  it('persists measured audio and deduplicates concurrent uploads by owner and hash', async () => {
    const [first, second] = await Promise.all([uploadAudio(), uploadAudio()]);
    expect(measuredDurationMs).toBeGreaterThan(2250);
    expect(first).toEqual(second);
    expect(AssetRecordSchema.parse(first)).toMatchObject({
      ownerId,
      hash: createHash('sha256').update(audio).digest('hex'),
      name: 'voz cubana.mp3',
      durationMs: measuredDurationMs,
      hasAudio: true,
    });
    expect(await assets.get(ownerId, first.id)).toEqual(first);
    expect(await readFile(await assets.resolveFile(ownerId, first.id))).toEqual(audio);
    expect(await assets.verify(ownerId, [first.id])).toEqual([]);
    const other = await assets.ingest(otherOwnerId, {
      stream: Readable.from([audio]),
      filename: 'voz cubana.mp3',
      mediaType: 'audio/mpeg',
    });
    expect(other.hash).toBe(first.hash);
    expect(other.id).not.toBe(first.id);
    await expect(assets.get(otherOwnerId, first.id)).rejects.toBeInstanceOf(AssetNotFoundError);
    await expect(assets.resolveFile(otherOwnerId, first.id)).rejects.toBeInstanceOf(
      AssetNotFoundError
    );
    expect(await assets.verify(otherOwnerId, [first.id])).toMatchObject([
      { code: 'asset-missing' },
    ]);
  });

  it('keeps metadata when bytes go missing and reports the missing asset', async () => {
    const record = await uploadAudio();
    await unlink(await assets.resolveFile(ownerId, record.id));

    await expect(assets.resolveFile(ownerId, record.id)).rejects.toBeInstanceOf(AssetNotFoundError);
    expect(await assets.get(ownerId, record.id)).toEqual(record);
    expect(await assets.verify(ownerId, [record.id])).toMatchObject([
      { severity: 'error', code: 'asset-missing' },
    ]);
  });

  it('stores bytes under the canonical PostgreSQL owner ID', async () => {
    const result = await assets.ingest(ownerId.toUpperCase(), {
      filename: 'voz cubana.mp3',
      mediaType: 'audio/mpeg',
      stream: Readable.from([audio]),
    });

    expect((await readdir(join(process.env.STUDIO_DATA_DIR!, 'assets'))).sort()).toEqual([
      '.incoming',
      ownerId,
    ]);
    expect(await readFile(await assets.resolveFile(ownerId, result.id))).toEqual(audio);
  });

  it('detects changed bytes even when length is unchanged', async () => {
    const record = await uploadAudio();
    const path = await assets.resolveFile(ownerId, record.id);
    const originalTime = new Date('2020-01-01T00:00:00Z');
    await utimes(path, originalTime, originalTime);
    await assets.resolveFile(ownerId, record.id);
    const original = await preview(record.id, 'bytes=0-9');
    expect(original.status).toBe(206);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(audio.subarray(0, 10));

    await writeFile(path, Buffer.alloc(audio.length));
    await utimes(path, originalTime, originalTime);

    await expect
      .soft(assets.resolveFile(ownerId, record.id))
      .rejects.toBeInstanceOf(AssetNotFoundError);
    for (const range of [undefined, 'bytes=0-9']) {
      const response = await preview(record.id, range);
      expect.soft(response.status).toBe(404);
      await response.body?.cancel();
    }
    expect(await assets.verify(ownerId, [record.id])).toMatchObject([
      { severity: 'error', code: 'asset-corrupt' },
    ]);
    expect(await assets.get(ownerId, record.id)).toEqual(record);
  });

  it.each(['ffv1', 'libvpx-vp9'])(
    'rejects Matroska %s declared as WebM before promotion',
    async (codec) => {
      const bytes = execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=size=16x16:rate=10:duration=1',
          '-c:v',
          codec,
          '-f',
          'matroska',
          'pipe:1',
        ],
        { timeout: 30000 }
      );

      await expect(
        assets.ingest(ownerId, {
          stream: Readable.from([bytes]),
          filename: 'presentación.webm',
          mediaType: 'video/webm',
        })
      ).rejects.toThrow(/tipo indicado/i);
      expect(await readdir(join(process.env.STUDIO_DATA_DIR!, 'assets'))).toEqual(['.incoming']);
      expect(await readdir(join(process.env.STUDIO_DATA_DIR!, 'assets/.incoming'))).toEqual([]);
    }
  );

  it('rejects traversal names, malformed uploads and paths that are not asset IDs', async () => {
    const input = {
      stream: Readable.from([audio]),
      filename: '../voz.mp3',
      mediaType: 'audio/mpeg',
    };
    await expect(assets.ingest(ownerId, input)).rejects.toThrow(/nombre/i);
    await expect(
      assets.ingest(ownerId, {
        ...input,
        stream: Readable.from(['<html>not audio</html>']),
        filename: 'voz.mp3',
      })
    ).rejects.toThrow(/archivo/i);
    await expect(assets.resolveFile(ownerId, '../voz.mp3')).rejects.toBeInstanceOf(
      AssetNotFoundError
    );
    expect(await readdir(join(process.env.STUDIO_DATA_DIR!, 'assets/.incoming'))).toEqual([]);
  });

  it('cleans up its temporary upload after a failed stream or database insert', async () => {
    const record = await uploadAudio();
    async function* failMidUpload() {
      yield audio.subarray(0, 100);
      throw new Error('Stream disconnected');
    }
    await expect(
      assets.ingest(ownerId, {
        filename: 'fallido.mp3',
        mediaType: 'audio/mpeg',
        stream: failMidUpload(),
      })
    ).rejects.toThrow('Stream disconnected');
    await expect(
      assets.ingest('00000000-0000-4000-8000-000000000000', {
        filename: 'sin usuario.mp3',
        mediaType: 'audio/mpeg',
        stream: Readable.from([audio]),
      })
    ).rejects.toThrow();
    expect(await readdir(join(process.env.STUDIO_DATA_DIR!, 'assets/.incoming'))).toEqual([]);
    expect(await assets.verify(ownerId, [record.id])).toEqual([]);
  });

  it('rejects a symlink pointing outside the storage root', async () => {
    const record = await uploadAudio();
    const path = await assets.resolveFile(ownerId, record.id);
    await unlink(path);
    await symlink(join(directory, 'voz cubana.mp3'), path);

    await expect(assets.resolveFile(ownerId, record.id)).rejects.toBeInstanceOf(AssetNotFoundError);
    expect(await assets.verify(ownerId, [record.id])).toMatchObject([{ code: 'asset-corrupt' }]);
  });

  it('rejects a symlink in a storage directory', async () => {
    const record = await uploadAudio();
    const path = await assets.resolveFile(ownerId, record.id);
    await unlink(path);
    await rmdir(dirname(path));
    await symlink(directory, dirname(path), 'dir');

    await expect(assets.resolveFile(ownerId, record.id)).rejects.toBeInstanceOf(AssetNotFoundError);
    await expect(uploadAudio()).rejects.toThrow();
  });

  it('persists font and data resources without a duration', async () => {
    // sfnt header and one in-bounds table directory entry.
    const font = Buffer.alloc(32);
    font.writeUInt32BE(0x00010000, 0);
    font.writeUInt16BE(1, 4);
    font.write('head', 12);
    font.writeUInt32BE(28, 20);
    font.writeUInt32BE(4, 24);
    const fontRecord = await assets.ingest(ownerId, {
      filename: 'Marca.ttf',
      mediaType: 'font/ttf',
      stream: Readable.from([font]),
    });
    expect(fontRecord).not.toHaveProperty('durationMs');
    expect(fontRecord).not.toHaveProperty('width');

    const dataRecord = await assets.ingest(ownerId, {
      filename: 'datos.json',
      mediaType: 'application/json',
      stream: Readable.from(['{"version":1}']),
    });
    expect(dataRecord).not.toHaveProperty('durationMs');
    const response = await preview(dataRecord.id);
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment/);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.json()).toEqual({ version: 1 });
  });

  it('measures image dimensions and refuses bytes of a different media type', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG6kAAAAASUVORK5CYII=',
      'base64'
    );
    const asset = await assets.ingest(ownerId, {
      filename: 'logo.png',
      mediaType: 'image/png',
      stream: Readable.from([png]),
    });
    expect(asset).toMatchObject({ width: 1, height: 1, hasAudio: false });
    expect(asset).not.toHaveProperty('durationMs');
    await expect(
      assets.ingest(ownerId, {
        filename: 'logo.jpg',
        mediaType: 'image/jpeg',
        stream: Readable.from([png]),
      })
    ).rejects.toThrow(/archivo/i);
    await expect(
      assets.ingest(ownerId, {
        filename: 'falsa.ttf',
        mediaType: 'font/ttf',
        stream: Readable.from([Buffer.from([0, 1, 0, 0])]),
      })
    ).rejects.toThrow(/fuente/i);
  });
});

describe('Studio asset routes', () => {
  it('uploads a binary request and serves authenticated full and partial streams', async () => {
    const name = 'grabación número 1.mp3';
    const response = await POST(
      new Request('http://localhost/api/studio/assets', {
        method: 'POST',
        body: new Uint8Array(audio),
        headers: { 'Content-Type': 'audio/mpeg', 'X-Studio-Filename': encodeURIComponent(name) },
      })
    );
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      data: { name, ownerId, durationMs: measuredDurationMs },
    });
    expect(AssetDescriptorSchema.parse(payload.data)).toEqual(payload.data);
    expect(payload.data).not.toHaveProperty('locator');

    const first = await preview(payload.data.id);
    expect(first.status).toBe(200);
    expect(first.headers.get('Accept-Ranges')).toBe('bytes');
    expect(first.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(first.headers.get('Content-Length')).toBe(String(audio.length));
    expect(Buffer.from(await first.arrayBuffer())).toEqual(audio);

    for (const [range, start, end] of [
      ['bytes=5-11', 5, 11],
      ['bytes=-8', audio.length - 8, audio.length - 1],
      [`bytes=${audio.length - 5}-`, audio.length - 5, audio.length - 1],
      [`bytes=12-${audio.length + 90}`, 12, audio.length - 1],
    ] as const) {
      const partial = await preview(payload.data.id, range);
      expect(partial.status).toBe(206);
      expect(partial.headers.get('Content-Range')).toBe(`bytes ${start}-${end}/${audio.length}`);
      expect(partial.headers.get('Content-Length')).toBe(String(end - start + 1));
      expect(Buffer.from(await partial.arrayBuffer())).toEqual(audio.subarray(start, end + 1));
    }
  });

  it('returns 416 for unsatisfiable, multi-part and malformed ranges', async () => {
    const record = await uploadAudio();
    for (const range of [
      `bytes=${audio.length}-`,
      'bytes=8-7',
      'bytes=0-1,4-9',
      'bytes=-0',
      'bogus',
    ]) {
      const response = await preview(record.id, range);
      expect(response.status).toBe(416);
      expect(response.headers.get('Content-Range')).toBe(`bytes */${audio.length}`);
    }
  });

  it('returns media headers without opening a stream for HEAD', async () => {
    const { id } = await uploadAudio();
    const response = await GET(
      new Request(`http://localhost/api/studio/assets/${id}`, {
        method: 'HEAD',
        headers: { Range: 'bytes=5-11' },
      }),
      { params: Promise.resolve({ id }) }
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(`bytes 5-11/${audio.length}`);
    expect(response.body).toBeNull();
  });

  it('requires authentication and only resolves the current owner’s assets', async () => {
    const record = await uploadAudio();
    asOwner(otherOwnerId);
    expect((await preview(record.id, 'bytes=0-1')).status).toBe(404);
    expect((await preview('../voz.mp3')).status).toBe(404);

    vi.mocked(requireAuth).mockRejectedValue(new UnauthorizedError());
    expect((await preview(record.id)).status).toBe(401);
    expect(
      (await POST(new Request('http://localhost/api/studio/assets', { method: 'POST' }))).status
    ).toBe(401);
  });

  it('authenticates before consuming the upload body', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new UnauthorizedError());
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          throw new Error('Unauthorized upload was consumed');
        },
      },
      { highWaterMark: 0 }
    );
    const request = new Request('http://localhost/api/studio/assets', {
      method: 'POST',
      body: stream,
      headers: { 'Content-Type': 'audio/mpeg', 'X-Studio-Filename': 'voz.mp3' },
      duplex: 'half',
    } as RequestInit);

    expect((await POST(request)).status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });
});

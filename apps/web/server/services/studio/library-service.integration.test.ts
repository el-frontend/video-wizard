import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import type { LibraryEntry } from '@workspace/video-project';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { requireAuth, UnauthorizedError } from '@/server/lib/auth';
import { studioAssets, studioLibraries } from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';
import { openStudioTestDb } from '@/test/studio-db';

import {
  LibraryBundleError,
  LibraryConflictError,
  LibraryNotFoundError,
  LibraryService,
} from './library-service';
import { AssetService } from './asset-service';
import { ProjectService } from './project-service';

vi.mock('@/server/lib/auth', () => ({
  requireAuth: vi.fn(),
  UnauthorizedError: class extends Error {},
}));

function asOwner(id: string) {
  vi.mocked(requireAuth).mockResolvedValue({ id, email: null, name: null, image: null });
}

const style = {
  id: 'noticias-liquid-glass',
  version: 1,
  name: 'Liquid Glass',
  kind: 'style',
  assetIds: [],
  tokens: { colors: { background: '#E9EFF7', foreground: '#102237' } },
  engines: [],
} satisfies LibraryEntry;

const component = {
  id: 'counter',
  version: 1,
  name: 'Contador',
  kind: 'component',
  assetIds: [],
  engine: 'hyperframes',
  manifest: { version: 1, props: {} },
} satisfies LibraryEntry;

describe('LibraryService with PostgreSQL and the local store', () => {
  let fixture: Awaited<ReturnType<typeof openStudioTestDb>>;
  let dataDir: string;
  let library: LibraryService;
  let owner: string;
  let otherOwner: string;

  beforeAll(async () => {
    fixture = await openStudioTestDb();
    dataDir = await mkdtemp(join(tmpdir(), 'studio-library-'));
    owner = await fixture.createOwner();
    otherOwner = await fixture.createOwner();
    library = new LibraryService(fixture.db, dataDir);
  }, 15_000);

  afterAll(async () => {
    await fixture?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('keeps a reopened project pinned to the immutable older style version', async () => {
    const projects = new ProjectService(fixture.db);
    await library.publish(owner, style);
    const { document, revision } = await projects.create(owner, {
      title: 'Noticias',
      engine: 'hyperframes',
    });
    const saved = await projects.save(owner, document.id, {
      baseRevision: revision,
      document: { ...document, styleRef: { id: style.id, version: 1 } },
    });
    await library.publish(owner, {
      ...style,
      version: 2,
      tokens: { colors: { foreground: '#111111' } },
    });

    const reopened = await new ProjectService(fixture.db).get(owner, document.id);
    expect(reopened).toEqual(saved);
    expect(
      await new LibraryService(fixture.db, dataDir).get(owner, reopened.document.styleRef!)
    ).toEqual(style);
    expect((await library.list(owner, { kind: 'style' })).map(({ version }) => version)).toEqual([
      2, 1,
    ]);
  });

  it('filters by engine and keeps caption components out of the visual style catalog', async () => {
    await library.publish(owner, component);
    const caption = {
      ...component,
      id: 'viral',
      name: 'Viral',
      engine: 'remotion',
      manifest: { version: 1, props: {}, builtin: { kind: 'remotion-caption', preset: 'viral' } },
    } satisfies LibraryEntry;
    await library.publish(owner, caption, Buffer.from('export function ViralTemplate() {}'));

    expect(await library.list(owner, { kind: 'component', engine: 'remotion' })).toEqual([caption]);
    expect(await library.list(owner, { kind: 'component', engine: 'hyperframes' })).toEqual([
      component,
    ]);
    await library.publish(owner, { ...style, id: 'remotion-style', engines: ['remotion'] });
    expect(
      (await library.list(owner, { kind: 'style', engine: 'remotion' })).map(({ id }) => id)
    ).toEqual(['remotion-style']);
    expect(await library.list(owner, { kind: 'style', engine: 'hyperframes' })).toEqual([]);
  });

  it('does not read another owner’s entry or include it in a catalog', async () => {
    const privateEntry = { ...component, id: 'private-component' };
    await library.publish(owner, privateEntry);
    await expect(library.get(otherOwner, privateEntry)).rejects.toBeInstanceOf(
      LibraryNotFoundError
    );
    expect(await library.list(otherOwner, { kind: 'component' })).toEqual([]);
    await library.publish(otherOwner, { ...privateEntry, name: 'Contador personal' });
    expect((await library.get(owner, privateEntry)).name).toBe('Contador');
    expect((await library.get(otherOwner, privateEntry)).name).toBe('Contador personal');
  });

  it('deduplicates matching concurrent publishes and preserves bytes on conflicts', async () => {
    const entry = { ...component, id: 'packaged-counter' };
    const bytes = Buffer.from('export default function Counter() {}');
    const expectedHash = createHash('sha256').update(bytes).digest('hex');
    const path = join(dataDir, 'library', owner, expectedHash);
    expect(
      await Promise.all([
        library.publish(owner, entry, bytes),
        library.publish(owner, entry, bytes),
      ])
    ).toEqual([entry, entry]);
    expect(
      (await library.list(owner, { kind: 'component' })).filter(({ id }) => id === entry.id)
    ).toEqual([entry]);
    expect(await readFile(path)).toEqual(bytes);
    const reopened = new LibraryService(fixture.db, dataDir);
    expect(await reopened.readBundle(owner, entry)).toEqual(bytes);

    await expect(
      reopened.publish(owner, entry, Buffer.from('different bytes'))
    ).rejects.toBeInstanceOf(LibraryConflictError);
    await expect(
      reopened.publish(owner, { ...entry, name: 'Different metadata' }, bytes)
    ).rejects.toBeInstanceOf(LibraryConflictError);
    await expect(reopened.publish(owner, entry)).rejects.toBeInstanceOf(LibraryConflictError);
    await expect(reopened.readBundle(otherOwner, entry)).rejects.toBeInstanceOf(
      LibraryNotFoundError
    );
    expect(await readFile(path)).toEqual(bytes);
  });

  it('refuses to load corrupted executable bytes from the local store', async () => {
    const entry = { ...component, id: 'damaged-counter' };
    const bytes = Buffer.from('export default function AnotherCounter() {}');
    await library.publish(owner, entry, bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(dataDir, 'library', owner, hash), Buffer.from('corrupted'));
    await expect(library.readBundle(owner, entry)).rejects.toBeInstanceOf(LibraryBundleError);
  });

  it('requires frozen bytes when first publishing a built-in caption preset', async () => {
    const builtin = {
      ...component,
      id: 'unpackaged-caption',
      engine: 'remotion',
      manifest: { version: 1, props: {}, builtin: { kind: 'remotion-caption', preset: 'viral' } },
    } satisfies LibraryEntry;
    await expect(library.publish(owner, builtin)).rejects.toBeInstanceOf(ValidationError);
    await expect(library.get(owner, builtin)).rejects.toBeInstanceOf(LibraryNotFoundError);
  });

  it('keeps ill-formed library IDs from aliasing a replacement character in PostgreSQL', async () => {
    const malformed = { ...component, id: 'alias\ud800' };
    const replacement = { ...component, id: 'alias\ufffd' };
    await expect(library.publish(owner, replacement)).resolves.toEqual(replacement);
    await expect(library.get(owner, malformed)).rejects.toBeInstanceOf(LibraryNotFoundError);
    await expect(library.publish(owner, malformed)).rejects.toBeInstanceOf(ValidationError);
    await expect(library.get(owner, replacement)).resolves.toEqual(replacement);
  });

  it('round-trips valid JSON escapes through publish, retry, get and filtering', async () => {
    const entry = { ...component, id: 'escaped-name', name: 'Nombre\u0000\ud800' };
    expect(await library.publish(owner, entry)).toEqual(entry);
    expect(await library.publish(owner, entry)).toEqual(entry);
    expect(await library.get(owner, entry)).toEqual(entry);
    expect(await library.list(owner, { kind: 'component', engine: 'hyperframes' })).toContainEqual(
      entry
    );
  });

  it('rejects an entry which references an asset unavailable to its owner', async () => {
    await expect(
      library.publish(owner, {
        ...component,
        id: 'missing-assets',
        assetIds: ['500b4510-01de-4b36-a716-707f4bdf42cb'],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('seed-studio-libraries CLI and HTTP library routes', () => {
  let fixture: Awaited<ReturnType<typeof openStudioTestDb>>;
  let dataDir: string;

  beforeAll(async () => {
    fixture = await openStudioTestDb();
    dataDir = await mkdtemp(join(tmpdir(), 'studio-library-seed-'));
    vi.doMock('@/server/db', () => ({ db: fixture.db }));
  }, 15_000);

  afterAll(async () => {
    await fixture?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('seeds twice with shared font bytes and reopens a project pinned to a seeded version', async () => {
    const owner = await fixture.createOwner();
    const library = new LibraryService(fixture.db, dataDir);
    const projects = new ProjectService(fixture.db);
    const assets = new AssetService(fixture.db, dataDir);
    const runSeed = async (account = owner) =>
      (
        await promisify(execFile)('pnpm', ['--filter', 'web', 'studio:seed-libraries', account], {
          timeout: 15_000,
          env: {
            ...process.env,
            DATABASE_URL: process.env.STUDIO_TEST_DATABASE_URL,
            STUDIO_DATA_DIR: dataDir,
          },
        })
      ).stdout;

    expect(await runSeed()).toContain('3 estilos, 10 componentes de subtítulos, 1 marca');
    const styles = await library.list(owner, { kind: 'style' });
    expect(styles.filter((style) => style.version === 1).map(({ id }) => id)).toEqual([
      'noticias-elfrontend-web',
      'noticias-liquid-glass',
      'noticias-modern-editorial',
    ]);
    const nativeStyles = await library.list(owner, { kind: 'style', engine: 'hyperframes' });
    expect(nativeStyles).toHaveLength(3);
    expect(nativeStyles.every((style) => style.version === 3)).toBe(true);
    const captions = await library.list(owner, { kind: 'component', engine: 'remotion' });
    expect(captions.map(({ id }) => id)).toEqual([
      'colorshift',
      'default',
      'highlight',
      'hormozi',
      'minimal',
      'modern',
      'mrbeast',
      'mrbeastemoji',
      'viral',
    ]);
    expect(
      captions.every(
        (entry) => entry.kind === 'component' && entry.manifest.builtin?.preset === entry.id
      )
    ).toBe(true);
    const viral = await library.readBundle(owner, { id: 'viral', version: 1 });
    expect(createHash('sha256').update(viral).digest('hex')).toBe(
      '2ff13129625609efb60df445531b4924f1d1b53f1098a75bd306821ae8a4f7ca'
    );
    const [brand] = await library.list(owner, { kind: 'brand', engine: 'hyperframes' });
    expect(brand).toMatchObject({
      kind: 'brand',
      id: 'elfrontend',
      values: {
        colors: { accent: '#FF6A3D' },
        typography: { display: { fontFamily: 'Bricolage Grotesque' } },
      },
    });
    const supported = await library.list(owner, { kind: 'style', engine: 'remotion' });
    expect(supported).toHaveLength(6);
    expect(supported.map((style) => style.version)).toEqual([3, 2, 3, 2, 3, 2]);
    const glass = styles.find(
      (style) => style.id === 'noticias-liquid-glass' && style.version === 1
    );
    if (glass?.kind !== 'style') throw new Error('Missing style fixture.');
    expect(glass.engines).toEqual([]);
    expect(glass.tokens).toMatchObject({
      colors: { background: '#E9EFF7', accent: '#2454A0' },
      typography: { display: { fontFamily: 'Geist', weight: 700 } },
      spacing: { 'safe-bottom': '384px' },
      motion: { eases: { enter: 'power3.out' } },
    });
    expect(glass.frameMarkdown).toContain('# Noticias · Liquid Glass');
    expect(glass.fonts?.map(({ family }) => family)).toEqual([
      'Archivo Black',
      'Bricolage Grotesque',
      'Geist',
      'Geist Mono',
    ]);
    const geist = glass.fonts?.find(({ family }) => family === 'Geist');
    const bytes = await readFile(await assets.resolveFile(owner, geist!.assetId));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608'
    );

    expect(await runSeed()).toContain('3 estilos, 10 componentes de subtítulos, 1 marca');
    expect(await library.list(owner, { kind: 'style' })).toEqual(styles);
    expect((await library.list(owner, { kind: 'template' })).map((e) => e.id)).toEqual([
      'boletin-de-escenas',
      'boletin-de-escenas',
      'short-con-subtitulos',
      'short-con-subtitulos',
    ]);
    expect(await fixture.db.$count(studioLibraries, eq(studioLibraries.ownerId, owner))).toBe(24);
    expect(await fixture.db.$count(studioAssets, eq(studioAssets.ownerId, owner))).toBe(4);

    const newOwner = await fixture.createOwner();
    await runSeed(newOwner);
    const ref = { id: 'viral', version: 1 };
    expect(await library.readBundle(newOwner, ref)).toEqual(viral);
    const newOwnerGlass = await library.get(newOwner, { id: glass.id, version: 1 });
    expect(newOwnerGlass.assetIds).toHaveLength(4);
    expect(newOwnerGlass.assetIds).not.toEqual(glass.assetIds);

    const { document, revision } = await projects.create(owner, {
      title: 'Edición fijada',
      engine: 'hyperframes',
    });
    const saved = await projects.save(owner, document.id, {
      baseRevision: revision,
      document: { ...document, styleRef: { id: glass.id, version: 1 } },
    });
    const updated = await library.publish(owner, {
      ...glass,
      version: 4,
      tokens: { colors: { background: '#FFFFFF' } },
    });
    expect(updated.version).toBe(4);
    const reopened = await new ProjectService(fixture.db).get(owner, document.id);
    expect(reopened).toEqual(saved);
    expect(
      await new LibraryService(fixture.db, dataDir).get(owner, reopened.document.styleRef!)
    ).toEqual(glass);
  }, 30_000);

  it.each([
    ['.', '/api/studio/libraries/component/1'],
    ['..', '/api/studio/libraries/1'],
  ])('rejects a dot ID (%s) removed by URL construction', async (id, normalizedPath) => {
    const owner = await fixture.createOwner();
    const { POST } = await import('@/app/api/studio/libraries/[kind]/route');
    const url = 'http://localhost/api/studio/libraries/component';
    asOwner(owner);

    expect(new URL(`${url}/${encodeURIComponent(id)}/1`).pathname).toBe(normalizedPath);
    expect(new URL(`${url}/${id.replaceAll('.', '%2e')}/1`).pathname).toBe(normalizedPath);
    const response = await POST(
      new Request(url, { method: 'POST', body: JSON.stringify({ ...component, id }) }),
      { params: Promise.resolve({ kind: 'component' }) }
    );
    expect(response.status).toBe(400);
  });

  it('round-trips a supplementary Unicode ID through the public URL and PostgreSQL', async () => {
    const owner = await fixture.createOwner();
    const { POST } = await import('@/app/api/studio/libraries/[kind]/route');
    const { GET } = await import('@/app/api/studio/libraries/[kind]/[id]/[version]/route');
    const url = 'http://localhost/api/studio/libraries/component';
    const entry = { ...component, id: 'editorial-🎬' };
    asOwner(owner);

    const created = await POST(new Request(url, { method: 'POST', body: JSON.stringify(entry) }), {
      params: Promise.resolve({ kind: entry.kind }),
    });
    expect(created.status).toBe(201);

    const request = new Request(new URL(`${url}/${encodeURIComponent(entry.id)}/${entry.version}`));
    const [kind, id, version] = new URL(request.url).pathname.split('/').slice(-3);
    expect(kind).toBe('component');
    expect(id).toBe('editorial-%F0%9F%8E%AC');
    expect(version).toBe('1');
    const reopened = await GET(request, {
      params: Promise.resolve({ kind: kind!, id: decodeURIComponent(id!), version: version! }),
    });
    expect(await reopened.json()).toEqual({ success: true, data: entry });
  });

  it('serves owner-scoped metadata and rejects mismatched kinds and version conflicts', async () => {
    const owner = await fixture.createOwner();
    const outsider = await fixture.createOwner();
    const { GET: list, POST } = await import('@/app/api/studio/libraries/[kind]/route');
    const { GET: get } = await import('@/app/api/studio/libraries/[kind]/[id]/[version]/route');
    const url = 'http://localhost/api/studio/libraries';
    const context = { params: Promise.resolve({ kind: 'component' }) };
    const getContext = (kind: string, version = '1') => ({
      params: Promise.resolve({ kind, id: component.id, version }),
    });
    const publish = (body: unknown, kind = 'component') =>
      POST(
        new Request(url + '/' + kind, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ kind }) }
      );
    const request = new NextRequest(url + '/component?engine=hyperframes');
    vi.mocked(requireAuth).mockRejectedValueOnce(new UnauthorizedError());
    expect((await publish(component)).status).toBe(401);
    asOwner(owner);

    expect((await publish({ ...component, ownerId: outsider })).status).toBe(400);
    expect((await publish(style)).status).toBe(400);
    expect((await publish({ ...style, engines: ['remotion'] }, 'style')).status).toBe(400);
    expect((await publish(style, 'style')).status).toBe(201);
    const created = await publish(component);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ success: true, data: component });
    expect((await publish({ ...component, name: 'Otro' })).status).toBe(409);
    expect(await (await list(request, context)).json()).toEqual({
      success: true,
      data: [component],
    });
    expect(await (await get(request, getContext('component'))).json()).toEqual({
      success: true,
      data: component,
    });
    expect((await get(request, getContext('style'))).status).toBe(404);
    expect((await get(request, getContext('component', '1.0'))).status).toBe(400);
    asOwner(outsider);
    expect(await (await list(request, context)).json()).toEqual({ success: true, data: [] });
    expect((await get(request, getContext('component'))).status).toBe(404);
  });
});

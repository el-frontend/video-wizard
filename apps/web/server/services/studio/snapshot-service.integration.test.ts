import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { libraryKey } from '@workspace/render-contract';
import type { LibraryEntry } from '@workspace/video-project';
import { openStudioTestDb } from '@/test/studio-db';
import { AssetService } from './asset-service';
import { LibraryService } from './library-service';
import { ProjectNotFoundError, ProjectService } from './project-service';
import { snapshotBuilder } from './snapshot-service';

let database: Awaited<ReturnType<typeof openStudioTestDb>>;
let directory: string;
beforeAll(async () => {
  database = await openStudioTestDb();
  directory = await mkdtemp(join(tmpdir(), 'studio-snapshot-'));
});
afterAll(async () => {
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('resolves immutable owner-scoped bytes after a newer publication', async () => {
  const owner = await database.createOwner(),
    other = await database.createOwner();
  const projects = new ProjectService(database.db);
  const library = new LibraryService(database.db, directory);
  const build = snapshotBuilder(new AssetService(database.db, directory), library);
  const style: LibraryEntry = {
    id: 'style',
    version: 1,
    kind: 'style',
    name: 'Estilo',
    tokens: {},
    assetIds: [],
    engines: [],
  };
  const component: LibraryEntry = {
    id: '__proto__',
    version: 1,
    kind: 'component',
    name: 'Texto',
    engine: 'remotion',
    assetIds: [],
    manifest: { version: 1, props: {} },
  };
  await library.publish(owner, style);
  await library.publish(owner, component, Buffer.from('version one'));
  const project = await projects.create(owner, { title: 'Prueba', engine: 'remotion' });
  const document = {
    ...project.document,
    styleRef: { id: style.id, version: 1 },
    durationMs: 1000,
    scenes: [
      {
        id: 'scene',
        durationMs: 1000,
        layers: [
          {
            type: 'component' as const,
            id: 'text',
            visible: true,
            endAnchor: 'fixed' as const,
            startMs: 0,
            endMs: 1000,
            zIndex: 0,
            props: {},
            componentRef: { id: component.id, version: 1 },
            box: { x: 0, y: 0, width: 100, height: 100 },
          },
        ],
      },
    ],
  };
  const saved = await projects.save(owner, document.id, {
    document,
    baseRevision: project.revision,
  });
  const first = await build(owner, saved);
  await library.publish(owner, { ...style, version: 2, engines: ['remotion'] });
  await library.publish(owner, { ...component, version: 2 }, Buffer.from('version two'));
  const next = await build(owner, await projects.get(owner, document.id));
  expect(next).toEqual(first);
  expect(next.bundles[libraryKey(component)]?.base64).toBe(
    Buffer.from('version one').toString('base64')
  );
  expect(next.dependencies.libraries[libraryKey(style)]).toEqual(style);
  await expect(build(other, saved)).rejects.toBeInstanceOf(ProjectNotFoundError);
});

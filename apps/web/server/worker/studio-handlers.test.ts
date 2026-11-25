import { expect, it, vi } from 'vitest';
import { exportTimes, snapshotDigest } from '@workspace/render-contract/export';
it('seals object keys canonically across JSONB round trips and samples within the timeline', () => {
  expect(snapshotDigest({ a: 1, b: [2, 3] })).toBe(snapshotDigest({ b: [2, 3], a: 1 }));
  expect(snapshotDigest({ a: 1, b: [2, 3] })).not.toBe(snapshotDigest({ a: 1, b: [3, 2] }));
  expect(exportTimes(1000)).toEqual([0, 500]);
  expect(exportTimes(1)).toEqual([0]);
});

it('reconciles a lost POST acknowledgement by polling the same attempt without another admission', async () => {
  const { randomUUID } = await import('node:crypto');
  const { exampleProject } = await import('@workspace/video-project/fixtures');
  const attemptId = randomUUID(),
    owner = randomUUID(),
    jobId = randomUUID();
  const document = {
    ...exampleProject(),
    id: randomUUID(),
    canvas: { width: 640, height: 480, fps: 25 },
    durationMs: 200,
    globalAudio: [],
    scenes: [{ id: 'one', durationMs: 200, layers: [] }],
  };
  const snapshot = {
    ownerId: owner,
    revision: randomUUID(),
    document,
    bundles: {},
    dependencies: { assets: {}, libraries: {} },
    diagnostics: [],
  };
  const snapshotHash = snapshotDigest(snapshot);
  const input = { kind: 'studio-export-v1', projectId: document.id, snapshot, snapshotHash };
  const claim = {
    job: { id: jobId, userId: owner, type: 'studio_export', inputData: input },
    task: { attemptId },
  };
  const receipt = vi.fn();
  const internal = vi
    .fn()
    .mockRejectedValueOnce(Error('Response lost'))
    .mockResolvedValueOnce(
      Response.json({
        status: 'completed',
        attemptId,
        snapshotHash,
        result: {
          width: 640,
          height: 480,
          hasAudio: false,
          durationMs: 200,
          artifacts: ['video.mp4', 'frame-0.png', 'frame-100.png'].map((p, i) => ({
            kind: i ? 'snapshot' : 'video',
            relativePath: p,
            sha256: 'a'.repeat(64),
          })),
        },
      })
    );
  vi.doMock('../services/studio/remotion-service', () => ({
    internal,
    StudioRenderError: class extends Error {},
  }));
  vi.doMock('../services/studio/export-service', () => ({
    exportsService: { receipt },
    storedExport: () => input,
    InvalidExport: class extends Error {},
    ExportAttemptFailure: class extends Error {},
  }));
  const { runStudioExport } = await import('./studio-handlers');
  expect(
    (
      await runStudioExport(claim as never, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      })
    ).durationMs
  ).toBe(200);
  expect(internal.mock.calls.map((c) => [c[1].scope, c[1].jobId, c[1].attemptId, c[2]])).toEqual(
    ['export.create', 'export.read'].map((scope) => [
      scope,
      jobId,
      attemptId,
      '/studio/export-attempts/' + attemptId,
    ])
  );
  expect(receipt).toHaveBeenCalledOnce();
});

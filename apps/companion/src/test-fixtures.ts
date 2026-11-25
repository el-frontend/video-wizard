import { vi } from 'vitest';
import type { Binding, CommandRunner, RequestEnvelope } from './protocol';

export const workspace = '/test/studio';
export const sessionId = 'd193b430-7c2f-4af0-8bc1-816e633e85a7';
export const otherSession = '134f4ab3-a14b-4a69-849a-0c2d9324419d';
export const binding: Binding = {
  id: 'cb08a107-9dec-4b70-9905-e08d0a55e82e',
  provider: 'codex',
  sessionId,
  workspace,
  createdAt: '2026-01-01T00:00:00.000Z',
};
export const envelope: RequestEnvelope = {
  requestId: 'request-1',
  projectId: 'project-1',
  baseRevision: 'rev-4',
  provider: 'codex',
  bindingId: binding.id,
  engine: 'hyperframes',
  selection: { sceneId: 'scene-1', layerId: null, captionId: null, timeMs: 300 },
  kind: 'feedback',
  message: 'Keep the text `with punctuation` and spaces.',
  callback: null,
};
export function result(stdout: string, stderr = '') {
  return { outcome: 'ok' as const, stdout, stderr };
}
export const commandSpy = () => vi.fn<CommandRunner>();

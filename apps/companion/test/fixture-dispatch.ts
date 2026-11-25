// Acceptance transport for a technical clone. It only returns a controlled receipt.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { componentExample } from '@workspace/video-project';
import { BindingStore } from '../src/binding-store';
import { privateJson, savePrivate } from '../src/private-files';
import { StudioApi } from '../src/api-client';
import { dispatchPending, PairedSchema } from '../src/request-dispatcher';
import { runAction } from '../src/action-client';
async function main() {
  const [space, project, bindingId, requestId, outcome] = process.argv.slice(2);
  assert.ok(
    space &&
      project &&
      bindingId &&
      requestId &&
      outcome &&
      ['feedback', 'component', 'waiting', 'delivery-unknown'].includes(outcome)
  );
  const dir = join(space, 'controlled');
  assert.match(await realpath(space), /^\/private\/tmp\/vw-r4-[a-zA-Z0-9]+$/);
  const store = await BindingStore.open({ workspace: join(process.cwd(), '../..'), dataDir: dir });
  const binding = await store.get(bindingId);
  assert.ok(binding);
  const pair = PairedSchema.parse(
    await privateJson(join(dir, 'pairs', project + '-' + binding.id + '.json'))
  );
  const api = new StudioApi(pair.origin);
  const result = await dispatchPending(
    api,
    pair,
    binding,
    {
      probe: async () => {
        throw Error('Not used');
      },
      dispatch: async (_binding, envelope) => {
        assert.equal(envelope.requestId, requestId);
        assert.equal(envelope.projectId, project);
        if (outcome === 'waiting')
          return { status: 'sent', paused: true, notice: 'Continúa la conversación vinculada.' };
        if (outcome === 'delivery-unknown')
          return { status: outcome, notice: 'No se pudo confirmar la entrega.' };
        const file = join(dir, 'action.json');
        if (outcome === 'component') {
          const example = componentExample('remotion');
          await savePrivate(dir, 'action.json', {
            ...example,
            kind: 'component',
            engine: 'remotion',
            name: 'Componente de prueba',
            requestId,
            baseRevision: envelope.baseRevision,
            commands: [
              {
                type: 'add-layer',
                sceneId: 'escena',
                layer: {
                  type: 'component',
                  id: 'propuesta',
                  visible: true,
                  startMs: 0,
                  endMs: 1500,
                  endAnchor: 'fixed',
                  zIndex: 3,
                  box: { x: 20, y: 20, width: 400, height: 160 },
                  props: example.manifest.initialProps,
                  componentRef: { id: '$candidate', version: 1 },
                },
              },
            ],
          });
          const staged = (await runAction(dir, requestId, 'proposal', file)) as {
            diagnostics: { severity: string; message: string }[];
          };
          assert.ok(
            !staged.diagnostics.some((d) => d.severity === 'error'),
            JSON.stringify(staged.diagnostics)
          );
        } else {
          await savePrivate(dir, 'action.json', {
            baseRevision: envelope.baseRevision,
            text: 'Titular revisado',
          });
          await runAction(dir, requestId, 'feedback', file, true);
        }
        await savePrivate(dir, 'action.json', { status: 'completed' });
        await runAction(dir, requestId, 'status', file);
        return { status: 'sent', deliveryId: 'technical-ack' };
      },
    },
    (g) =>
      savePrivate(join(dir, 'attempts'), requestId + '.json', { origin: pair.origin, grant: g }),
    requestId
  );
  console.log(JSON.stringify(result));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Fixture failed');
  process.exitCode = 1;
});

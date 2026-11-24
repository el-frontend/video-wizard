import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { expect, it } from 'vitest';
import { signServiceToken } from '@workspace/service-auth';
import { componentExample } from '@workspace/video-project';
import { installStudioRoutes } from './studio-http';
it('binds compile and check admission to the signed owner, project, proposal and exact operation', async () => {
  const app = express(),
    server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port,
    secret = randomBytes(40).toString('hex'),
    ownerId = randomUUID(),
    projectId = randomUUID(),
    proposalId = randomUUID();
  const api = installStudioRoutes(app, {
    secret,
    previewOrigin: origin,
    editorOrigin: 'http://localhost:31792',
  });
  const source = { ownerId, projectId, proposalId, ...componentExample('remotion') };
  async function send(endpoint: string, scope: string, body: unknown) {
    return fetch(origin + '/studio/components/' + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Bearer ' +
          (await signServiceToken(
            { audience: 'video-wizard-renderer', scope, ownerId, projectId, proposalId },
            { secret }
          )),
      },
      body: JSON.stringify(body),
    });
  }
  try {
    const response = await send('compile', 'proposal.compile', source);
    expect(response.status).toBe(200);
    expect((await response.json()).moduleHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await send('compile', 'proposal.check', source)).status).toBe(401);
    for (const key of ['ownerId', 'projectId', 'proposalId'])
      expect(
        (await send('compile', 'proposal.compile', { ...source, [key]: randomUUID() })).status
      ).toBe(404);
    expect(
      (
        await send('check', 'proposal.check', {
          proposalId,
          snapshot: { ownerId, document: { id: randomUUID() } },
        })
      ).status
    ).toBe(404);
  } finally {
    await api.close();
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

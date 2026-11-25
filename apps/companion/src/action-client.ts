import { basename, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { StudioApi } from './api-client';
import { GrantSchema } from './request-dispatcher';
import { privateJson } from './private-files';
export async function runAction(
  directory: string,
  id: string,
  operation: string,
  file?: string,
  approved = false
) {
  const saved = z
    .strictObject({ origin: z.string(), grant: GrantSchema })
    .parse(await privateJson(join(directory, 'attempts', z.uuid().parse(id) + '.json')));
  const { grant } = saved,
    r = grant.request;
  if (id !== r.id) throw Error('Intento no válido.');
  const api = new StudioApi(saved.origin),
    project = '/api/studio/projects/' + r.projectId,
    request = project + '/requests/' + id;
  if (operation === 'source') return api.call('GET', request + '/ranges', grant.token);
  if (operation === 'read') return api.call('GET', project, grant.token);
  if (operation === 'begin-voice') {
    if (!approved)
      throw Error(
        'Confirma el perfil, el texto y una sola generación en el chat y usa --approved.'
      );
    return api.call('POST', request + '/generation', grant.token);
  }
  if (!file) throw Error('La operación requiere --file.');
  if (operation === 'upload') {
    const ext = basename(file).split('.').pop()?.toLowerCase() ?? '';
    const type: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      webm: 'audio/webm',
    };
    if (!type[ext]) throw Error('Tipo de audio no válido.');
    return api.call('POST', '/api/studio/assets', grant.token, await readFile(file), {
      'Content-Type': type[ext],
      'X-Studio-Filename': encodeURIComponent(basename(file)),
    });
  }
  const data = await privateJson(file);
  if (operation === 'feedback' || operation === 'audio') {
    if (!approved) throw Error('Confirma el cambio en la conversación y usa --approved.');
    return api.call(
      operation === 'audio' ? 'POST' : 'PUT',
      project + (operation === 'audio' ? '/audio' : ''),
      grant.token,
      data
    );
  }
  if (operation === 'proposal') return api.call('POST', project + '/proposals', grant.token, data);
  if (operation === 'ranges' || operation === 'status')
    return api.call('POST', request + '/' + operation, grant.token, data);
  throw Error('Acción desconocida.');
}

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { z } from 'zod';

export function canonicalOrigin(value: string) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !(url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) ||
    url.origin !== value ||
    url.username ||
    url.password
  )
    throw Error('Se requiere el origen canónico local del editor.');
  return url.origin;
}
export class StudioApi {
  readonly origin: string;
  constructor(origin: string) {
    this.origin = canonicalOrigin(origin);
  }
  async call<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<T> {
    if (
      !path.startsWith('/api/studio/') ||
      path.startsWith('//') ||
      !/^[a-zA-Z0-9_\-/.]+$/.test(path) ||
      path.includes('..')
    )
      throw Error('Ruta de Studio no válida.');
    const url = new URL(path, this.origin);
    const payload =
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const req = (url.protocol === 'http:' ? httpRequest : httpsRequest)(
        url,
        {
          method,
          hostname: '127.0.0.1',
          servername: url.hostname,
          agent: false,
          headers: {
            ...(payload && {
              'Content-Type': 'application/json',
              'Content-Length': payload.byteLength,
            }),
            ...additionalHeaders,
            Host: url.host,
            Authorization: 'Bearer ' + token,
          },
        },
        (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(Error('Studio rechazó la operación (HTTP ' + res.statusCode + ').'));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 16 * 1024 * 1024) req.destroy(Error('Respuesta demasiado grande.'));
            else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            try {
              const result = z
                .object({ success: z.literal(true), data: z.unknown() })
                .parse(JSON.parse(Buffer.concat(chunks).toString()));
              resolve(result.data as T);
            } catch {
              reject(Error('Respuesta de Studio no válida.'));
            }
          });
        }
      );
      req.setTimeout(120_000, () => req.destroy(Error('Studio no confirmó la operación.')));
      req.on('error', reject);
      req.end(payload);
    });
  }
}

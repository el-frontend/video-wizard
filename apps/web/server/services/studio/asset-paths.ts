import type { FileHandle } from 'node:fs/promises';
export * from '@workspace/render-contract/storage';

export function streamAssetFile(file: FileHandle, start: number, end: number) {
  let position = start;
  let cancelled = false;

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const bytes = new Uint8Array(Math.min(64 * 1024, end - position + 1));
          const { bytesRead } = await file.read(bytes, 0, bytes.length, position);
          if (cancelled) return;
          if (bytesRead === 0) throw new Error('Studio asset ended before its expected length.');

          position += bytesRead;
          controller.enqueue(bytes.subarray(0, bytesRead));
          if (position > end) {
            await file.close();
            if (!cancelled) controller.close();
          }
        } catch (error) {
          await file.close();
          if (!cancelled) throw error;
        }
      },
      cancel() {
        // A pending read can finish after Chrome aborts to seek to another byte range.
        cancelled = true;
        return file.close();
      },
    },
    { highWaterMark: 0 }
  );
}

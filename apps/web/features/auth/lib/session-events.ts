export const sessionEvents = {
  expired: 'studio:session-expired',
  restored: 'studio:session-restored',
  accountChanged: 'studio:account-changed',
  ending: 'studio:ending-session',
  checkDirty: 'studio:check-dirty',
  leaving: 'studio:leaving-session',
} as const;

export const previewRetirementTimeoutMs = 2000;
const previews = new Set<() => Promise<void>>();
export function registerPreviewRetirement(retire: () => Promise<void>) {
  previews.add(retire);
  return () => previews.delete(retire);
}
export async function retirePreviews() {
  if (!previews.size) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Renderer cleanup is best effort. Revoking the web session must still proceed.
    await Promise.race([
      Promise.allSettled(Array.from(previews, async (retire) => retire())),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, previewRetirementTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

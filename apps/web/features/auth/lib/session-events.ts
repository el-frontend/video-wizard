export const sessionEvents = {
  expired: 'studio:session-expired',
  restored: 'studio:session-restored',
  accountChanged: 'studio:account-changed',
  ending: 'studio:ending-session',
  checkDirty: 'studio:check-dirty',
  leaving: 'studio:leaving-session',
} as const;

const previews = new Set<() => Promise<void>>();
export function registerPreviewRetirement(retire: () => Promise<void>) {
  previews.add(retire);
  return () => previews.delete(retire);
}
export async function retirePreviews() {
  await Promise.allSettled(Array.from(previews, (retire) => retire()));
}

const fallback = '/projects';
const base = 'https://studio.invalid';

export function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw !== raw.trim()) return fallback;
  let path = raw.split(/[?#]/, 1)[0]!;
  try {
    for (let depth = 0; depth < 8; depth++) {
      if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        path.includes('\\') ||
        Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      )
        return fallback;
      const url = new URL(path, base);
      if (url.origin !== base || url.pathname.startsWith('//')) return fallback;
      const decoded = decodeURIComponent(path);
      if (decoded === path) return raw;
      path = decoded;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

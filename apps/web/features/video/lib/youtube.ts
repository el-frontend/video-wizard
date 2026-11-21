/** Accept supported YouTube hosts and video pages, including links pasted without a scheme. */
export function extractVideoId(input: string): string | null {
  const value = input.trim();
  let url: URL;
  try {
    url = new URL(/^[\w+.-]+:/.test(value) ? value : 'https://' + value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    return null;
  let id: string | null;
  if (url.hostname === 'youtu.be') id = url.pathname.match(/^\/([\w-]+)\/?$/)?.[1] ?? null;
  else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : (url.pathname.match(/^\/(?:shorts|embed|v)\/([\w-]+)\/?$/)?.[1] ?? null);
  } else return null;
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
export function isYouTubeUrl(input: string): boolean {
  return extractVideoId(input) !== null;
}

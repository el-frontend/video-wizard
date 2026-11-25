import { NextRequest, NextResponse } from 'next/server';

// Browser cookies are host scoped. Preserve old local bookmarks on the canonical editor host.
export function proxy(request: NextRequest) {
  const configured = process.env.BETTER_AUTH_URL;
  if (!configured) return NextResponse.next();
  const editor = new URL(configured);
  if (editor.hostname !== 'app.video-wizard.localhost') return NextResponse.next();
  const host = request.headers.get('host');
  if (host === editor.host) return NextResponse.next();
  const localAliases = ['localhost', '127.0.0.1'].map((name) =>
    editor.port ? name + ':' + editor.port : name
  );
  if (!localAliases.includes(host ?? '') || !['GET', 'HEAD'].includes(request.method))
    return new NextResponse(null, { status: 421 });
  editor.pathname = request.nextUrl.pathname;
  editor.search = request.nextUrl.search;
  return NextResponse.redirect(editor);
}

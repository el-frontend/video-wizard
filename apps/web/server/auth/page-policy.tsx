import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { WorkspaceShell } from '@/features/auth/components/workspace-shell';
import { safeReturnPath } from '@/lib/safe-return-path';

type Query = Record<string, string | string[] | undefined>;
type User = NonNullable<Awaited<ReturnType<typeof auth>>>['user'];
type Props = { params: Promise<Record<string, string>>; searchParams: Promise<Query> };

export function workspacePage(
  path: string,
  render: (user: User, props: Props) => ReactNode | Promise<ReactNode>
) {
  return async function ProtectedPage(props: Props) {
    const identity = await auth();
    if (!identity) {
      const params = await props.params;
      const route = path.replace(/\[(\w+)\]/g, (_, key: string) =>
        encodeURIComponent(params[key] ?? '')
      );
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(await props.searchParams)) {
        if (typeof value === 'string') query.append(key, value);
        else value?.forEach((item) => query.append(key, item));
      }
      const target = safeReturnPath(route + (query.size ? '?' + query : ''));
      redirect('/signin?callbackUrl=' + encodeURIComponent(target));
    }
    return (
      <WorkspaceShell key={identity.user.id} user={identity.user} sessionId={identity.session.id}>
        {await render(identity.user, props)}
      </WorkspaceShell>
    );
  };
}

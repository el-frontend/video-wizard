'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Card } from '@workspace/ui/components/card';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { authClient } from '@/lib/auth-client';
import {
  bindWorkspaceSession,
  resumeWorkspaceJobs,
  suspendWorkspace,
} from '@/lib/authenticated-fetch';
import { CredentialsForm } from './credentials-form';
import { retirePreviews, sessionEvents } from '../lib/session-events';

type WorkspaceUser = { id: string; name: string | null; email: string | null };

export function WorkspaceShell({
  user,
  sessionId,
  children,
}: {
  user: WorkspaceUser;
  sessionId: string;
  children: ReactNode;
}) {
  const live = authClient.useSession();
  const [locked, setLocked] = useState(false);
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const currentSession = useRef<string | null>(sessionId);
  const differentOwner = !!live.data && live.data.user.id !== user.id;
  useLayoutEffect(() => {
    bindWorkspaceSession(user.id, sessionId);
    const expire = () => {
      suspendWorkspace();
      setLocked(true);
    };
    const change = () => {
      suspendWorkspace();
      setDestination('/projects');
    };
    const beforeCache = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      document.documentElement.style.visibility = 'hidden';
      suspendWorkspace();
    };
    const restorePage = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pagehide', beforeCache);
    window.addEventListener('pageshow', restorePage);
    window.addEventListener(sessionEvents.expired, expire);
    window.addEventListener(sessionEvents.accountChanged, change);
    return () => {
      window.removeEventListener('pagehide', beforeCache);
      window.removeEventListener('pageshow', restorePage);
      window.removeEventListener(sessionEvents.expired, expire);
      window.removeEventListener(sessionEvents.accountChanged, change);
      suspendWorkspace();
    };
  }, [user.id, sessionId]);
  useLayoutEffect(() => {
    if (differentOwner) {
      window.dispatchEvent(new Event(sessionEvents.accountChanged));
    } else if (live.data && live.data.session.id !== currentSession.current) {
      currentSession.current = live.data.session.id;
      bindWorkspaceSession(user.id, currentSession.current);
      setLocked(false);
      window.dispatchEvent(new Event(sessionEvents.restored));
    } else if (!live.isPending && !live.data && (!live.error || live.error.status === 401)) {
      suspendWorkspace();
      setLocked(true);
    }
  }, [differentOwner, live.data, live.isPending, live.error, user.id]);
  useEffect(() => {
    if (destination) {
      window.dispatchEvent(new Event(sessionEvents.leaving));
      window.location.replace(destination);
    }
  }, [destination]);
  useEffect(() => {
    if (locked) heading.current?.focus();
  }, [locked]);
  async function signedIn(id: string) {
    if (id !== user.id) {
      window.dispatchEvent(new Event(sessionEvents.accountChanged));
      return;
    }
    const verified = await authClient.getSession();
    if (!verified.data || verified.data.user.id !== user.id) {
      if (verified.data) {
        window.dispatchEvent(new Event(sessionEvents.accountChanged));
        return;
      }
      throw new Error('Sesión no disponible.');
    }
    currentSession.current = verified.data.session.id;
    bindWorkspaceSession(id, currentSession.current);
    setLocked(false);
    window.dispatchEvent(new Event(sessionEvents.restored));
  }
  async function signOut() {
    if (busy) return;
    const clean = window.dispatchEvent(new Event(sessionEvents.checkDirty, { cancelable: true }));
    if (
      !clean &&
      !window.confirm(
        'Hay cambios sin guardar. Al volver podrás recuperar los borradores que este navegador haya conservado. ¿Quieres cerrar sesión?'
      )
    )
      return;
    window.dispatchEvent(new Event(sessionEvents.ending));
    setBusy(true);
    setError('');
    try {
      await retirePreviews();
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      suspendWorkspace();
      setDestination('/signin');
    } catch {
      resumeWorkspaceJobs(user.id);
      window.dispatchEvent(new Event(sessionEvents.restored));
      setError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  if (destination || differentOwner) return <p role="status">Cambiando de sesión…</p>;
  return (
    <>
      <div hidden={locked} inert={locked || busy}>
        <div className="flex h-screen overflow-hidden">
          <AppSidebar
            userLabel={user.name || user.email || 'Mi cuenta'}
            onSignOut={signOut}
            busy={busy}
            error={error}
          />
          <main className="flex-1 overflow-y-auto ml-64">
            <div className="container mx-auto p-6">{children}</div>
          </main>
        </div>
      </div>
      {locked && (
        <main className="flex min-h-dvh items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md gap-4 p-8">
            <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
              Tu sesión ha caducado
            </h1>
            <p className="text-sm text-muted-foreground">
              Vuelve a entrar con la misma cuenta para continuar donde estabas.
            </p>
            <CredentialsForm initialEmail={user.email ?? ''} onSuccess={signedIn} />
          </Card>
        </main>
      )}
    </>
  );
}

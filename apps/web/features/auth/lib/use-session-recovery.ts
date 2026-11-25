'use client';

import { useEffect, useState } from 'react';
import { sessionEvents } from './session-events';

// Include this version only in effects that load workspace data with GET.
export function useSessionRecovery() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const restored = () => setVersion((previous) => previous + 1);
    window.addEventListener(sessionEvents.restored, restored);
    return () => window.removeEventListener(sessionEvents.restored, restored);
  }, []);
  return version;
}

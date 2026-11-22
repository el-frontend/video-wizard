'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { BrandKitSchema, BRAND_KIT_STORAGE_KEY, type BrandKit } from '../types/brand-kit';

function parse(value: string | null): BrandKit | null {
  try {
    return value ? BrandKitSchema.parse(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function useBrandKit(ownerId: string) {
  const key = BRAND_KIT_STORAGE_KEY + ':' + ownerId;
  const subscribe = useCallback(
    (listener: () => void) => {
      window.addEventListener('storage', listener);
      window.addEventListener(key, listener);
      return () => {
        window.removeEventListener('storage', listener);
        window.removeEventListener(key, listener);
      };
    },
    [key]
  );
  const read = useCallback(() => localStorage.getItem(key), [key]);
  const value = useSyncExternalStore(subscribe, read, () => null);
  const brandKit = useMemo(() => parse(value), [value]);

  const setBrandKit = useCallback(
    (kit: BrandKit | null) => {
      if (kit) localStorage.setItem(key, JSON.stringify(kit));
      else localStorage.removeItem(key);
      window.dispatchEvent(new Event(key));
    },
    [key]
  );
  const updateBrandKit = useCallback(
    (updates: Partial<BrandKit>) => {
      setBrandKit(BrandKitSchema.parse({ ...parse(read()), ...updates }));
    },
    [read, setBrandKit]
  );
  return { brandKit, setBrandKit, updateBrandKit, clearBrandKit: () => setBrandKit(null) };
}

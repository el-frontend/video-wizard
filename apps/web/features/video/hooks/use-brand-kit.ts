'use client';

import { useCallback, useState } from 'react';
import { BrandKitSchema, BRAND_KIT_STORAGE_KEY } from '../types/brand-kit';
import type { BrandKit } from '../types/brand-kit';

/**
 * Load brand kit from localStorage with Zod validation
 */
function loadBrandKitFromStorage(): BrandKit | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(BRAND_KIT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return BrandKitSchema.parse(parsed);
    }
  } catch {
    localStorage.removeItem(BRAND_KIT_STORAGE_KEY);
  }
  return null;
}

/**
 * Hook for managing brand kit state with localStorage persistence
 *
 * Loads brand kit from localStorage on mount and saves on every change.
 * Uses Zod validation to ensure data integrity.
 */
export function useBrandKit() {
  const [brandKit, setBrandKitState] = useState<BrandKit | null>(() => loadBrandKitFromStorage());

  // Set the entire brand kit
  const setBrandKit = useCallback((kit: BrandKit | null) => {
    setBrandKitState(kit);
    if (kit) {
      localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify(kit));
    } else {
      localStorage.removeItem(BRAND_KIT_STORAGE_KEY);
    }
  }, []);

  // Update individual brand kit fields (merge with existing)
  const updateBrandKit = useCallback((updates: Partial<BrandKit>) => {
    setBrandKitState((prev) => {
      const updated = { ...(prev ?? {}), ...updates } as BrandKit;
      localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear brand kit entirely
  const clearBrandKit = useCallback(() => {
    setBrandKitState(null);
    localStorage.removeItem(BRAND_KIT_STORAGE_KEY);
  }, []);

  return {
    brandKit,
    setBrandKit,
    updateBrandKit,
    clearBrandKit,
  };
}

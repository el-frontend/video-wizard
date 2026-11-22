// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BRAND_KIT_STORAGE_KEY } from '../types/brand-kit';
import { useBrandKit } from './use-brand-kit';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('brandKitIsScopedToUserAndUnownedLegacyKitNotAssigned', () => {
  localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify({ primaryColor: '#abcdef' }));
  const view = renderHook(({ owner }) => useBrandKit(owner), { initialProps: { owner: 'A' } });
  expect(view.result.current.brandKit).toBeNull();
  act(() => view.result.current.updateBrandKit({ primaryColor: '#123456' }));
  view.rerender({ owner: 'B' });
  expect(view.result.current.brandKit).toBeNull();
  view.rerender({ owner: 'A' });
  expect(view.result.current.brandKit?.primaryColor).toBe('#123456');
  expect(localStorage.getItem(BRAND_KIT_STORAGE_KEY)).toContain('#abcdef');
});

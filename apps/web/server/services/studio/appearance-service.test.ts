import { expect, it } from 'vitest';

import { resolveAppearance } from './appearance-service';

it('merges style roles, lets a brand write only roles exposed by both, and prefers explicit overrides', () => {
  const result = resolveAppearance({
    defaults: {
      tokens: {
        colors: { accent: '#003366', foreground: '#111111', background: '#FFFFFF' },
        typography: { display: { fontFamily: 'Geist', weight: 400 } },
      },
      exposedRoles: ['colors.accent', 'colors.foreground', 'typography.display.fontFamily'],
    },
    style: {
      tokens: {
        colors: { accent: '#2454A0', surface: '#DDEEFF' },
        typography: { display: { weight: 700 } },
      },
      exposedRoles: ['colors.accent', 'colors.background', 'typography.display.fontFamily'],
    },
    brand: {
      values: {
        colors: { accent: '#1A746F', foreground: '#EEEEEE', background: '#EEEEEE' },
        typography: { display: { fontFamily: 'Bricolage Grotesque', weight: 555 } },
      },
    },
    overrides: { colors: { accent: '#632570' } },
  });

  expect(result.tokens).toEqual({
    colors: {
      accent: '#632570',
      foreground: '#111111',
      background: '#FFFFFF',
      surface: '#DDEEFF',
    },
    typography: { display: { fontFamily: 'Bricolage Grotesque', weight: 700 } },
  });
  expect(result.diagnostics.map(({ code }) => code)).toEqual([
    'brand-role-ignored',
    'brand-role-ignored',
    'brand-role-ignored',
  ]);
});

it('checks contrast and numeric limits on the effective overrides', () => {
  const defaults = {
    tokens: { colors: { foreground: '#111111', background: '#FFFFFF' }, opacity: 1 },
    contrast: [{ foreground: 'colors.foreground', background: 'colors.background', min: 4.5 }],
    limits: [{ role: 'opacity', min: 0, max: 1 }],
  };

  expect(resolveAppearance({ defaults }).diagnostics).toEqual([]);
  const { diagnostics } = resolveAppearance({
    defaults,
    overrides: { colors: { foreground: '#EEEEEE' }, opacity: 1.2 },
  });
  expect(diagnostics.map(({ code }) => code)).toEqual(['appearance-contrast', 'appearance-limit']);
});

it('does not let a role cross an unexposed subtree', () => {
  const result = resolveAppearance({
    defaults: {
      tokens: { colors: { accent: '#2454A0', foreground: '#111111' } },
      exposedRoles: ['colors.accent'],
    },
    style: {
      tokens: {},
      exposedRoles: ['colors.accent'],
    },
    brand: {
      values: { 'colors.accent': '#1A746F', colors: { accent: { foreground: '#EEEEEE' } } },
    },
  });

  expect(result.tokens).toEqual({ colors: { accent: '#2454A0', foreground: '#111111' } });
  expect(result.diagnostics.map(({ code }) => code)).toEqual([
    'brand-role-ignored',
    'brand-role-ignored',
  ]);
});

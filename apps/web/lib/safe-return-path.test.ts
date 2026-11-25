import { expect, it } from 'vitest';
import { safeReturnPath } from './safe-return-path';
it('safeReturnRejectsExternalEncodedTargets', () => {
  for (const target of [
    null,
    '',
    'https://example.test/',
    '//example.test',
    '/%252fexample.test',
    '/a/..//example.test',
    '/%5cexample.test',
    '/%0A/foo',
    '%2F%2Fexample.test',
  ]) {
    expect(safeReturnPath(target)).toBe('/projects');
  }
  expect(safeReturnPath('/jobs?type=analysis&tag=a%2Fb')).toBe('/jobs?type=analysis&tag=a%2Fb');
});

import { expect, it } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { projectPins, libraryKey } from './snapshot';
it('retains distinct references and coalesces identical version pins', () => {
  const document = exampleProject();
  document.scenes[0]!.templateRef = { id: 'sub', version: 3 };
  document.scenes[1]!.templateRef = { id: 'sub', version: 4 };
  expect(projectPins(document).map(libraryKey)).toEqual([
    '["estilo",2]',
    '["marca",1]',
    '["sub",3]',
    '["card",1]',
    '["sub",4]',
  ]);
});

import { expect, it } from 'vitest';
import { editCaptions } from './caption-editing';

const cue = {
  id: 'original',
  startMs: 100,
  endMs: 1100,
  text: 'Qué día',
  words: [
    { text: 'Qué', startMs: 25, endMs: 340 },
    { text: 'día', startMs: 550, endMs: 880 },
  ],
};
it('splits and merges with stable ids and exact cue-local word offsets', () => {
  const halves = editCaptions([cue], {
    type: 'split',
    id: cue.id,
    atMs: 600,
    textIndex: 4,
    newId: 'right',
  });
  expect(halves).toEqual([
    { ...cue, endMs: 600, text: 'Qué', words: [cue.words[0]] },
    {
      id: 'right',
      startMs: 600,
      endMs: 1100,
      text: 'día',
      words: [{ text: 'día', startMs: 50, endMs: 380 }],
    },
  ]);
  expect(editCaptions(halves, { type: 'merge', id: cue.id })).toEqual([cue]);
});
it('edits only the affected alignment, rejects blank words and keeps add/delete reversible', () => {
  const other = { ...cue, id: 'other', startMs: 2000, endMs: 3000 };
  const edited = editCaptions([cue, other], {
    type: 'update',
    id: cue.id,
    patch: { text: 'Qué noche' },
  });
  expect(edited[0]?.words).toBeUndefined();
  expect(edited[1]).toEqual(other);
  expect(() =>
    editCaptions([], { type: 'add', cue: { ...cue, words: [{ text: ' ', startMs: 0, endMs: 1 }] } })
  ).toThrow();
  expect(
    editCaptions(editCaptions([], { type: 'add', cue }), { type: 'delete', id: cue.id })
  ).toEqual([]);
});
it('never assigns crossing words to an invented interval and keeps text on both sides', () => {
  const crossing = { ...cue, words: [{ text: 'Qué', startMs: 10, endMs: 510 }, cue.words[1]!] };
  const [left, right] = editCaptions([crossing], {
    type: 'split',
    id: cue.id,
    newId: 'dos',
    textIndex: 4,
    atMs: 600,
  });
  expect(left).toMatchObject({ text: 'Qué' });
  expect(left?.words).toBeUndefined();
  expect(right?.words).toEqual([{ text: 'día', startMs: 50, endMs: 380 }]);
  const changed = editCaptions([cue], {
    type: 'update',
    id: cue.id,
    patch: { startMs: 200, endMs: 1000 },
  });
  expect(changed[0]?.words).toEqual([{ text: 'día', startMs: 450, endMs: 780 }]);
});

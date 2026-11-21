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
const greeting = {
  id: 'greeting',
  startMs: 100,
  endMs: 1000,
  text: 'Hola, mundo',
  words: [
    { text: 'hola', startMs: 25, endMs: 240 },
    { text: 'mundo', startMs: 510, endMs: 800 },
  ],
};
it('preserves measured spelling and alignment for an unchanged or time-only update', () => {
  const edit = (patch: Partial<typeof greeting>) =>
    editCaptions([greeting], { type: 'update', id: greeting.id, patch });
  expect(edit({ text: 'Hola, mundo', startMs: 100, endMs: 1000 })[0]).toBe(greeting);
  expect(edit({ startMs: 110 })[0]?.words).toEqual([
    { text: 'hola', startMs: 15, endMs: 230 },
    { text: 'mundo', startMs: 500, endMs: 790 },
  ]);
});
it('splits measured words across a display-case and punctuation boundary without inventing text', () => {
  const halves = editCaptions([greeting], {
    type: 'split',
    id: greeting.id,
    newId: 'after',
    textIndex: 6,
    atMs: 550,
  });
  expect(halves.map((c) => [c.text, c.words])).toEqual([
    ['Hola,', [greeting.words[0]]],
    ['mundo', [{ text: 'mundo', startMs: 60, endMs: 350 }]],
  ]);
});
it('keeps a measured percent sign on its textual side with exact split-local times', () => {
  const percent = {
    id: 'percent',
    startMs: 0,
    endMs: 1000,
    text: '50 % hoy',
    words: [
      { text: '50', startMs: 0, endMs: 200 },
      { text: '%', startMs: 200, endMs: 400 },
      { text: 'hoy', startMs: 600, endMs: 900 },
    ],
  };
  const split = (atMs: number, textIndex: number) =>
    editCaptions([percent], { type: 'split', id: percent.id, newId: 'after', atMs, textIndex });
  const [before, after] = split(500, 5);
  expect(before?.text).toBe('50 %');
  expect(before?.words).toEqual(percent.words.slice(0, 2));
  expect(after?.words).toEqual([{ text: 'hoy', startMs: 100, endMs: 400 }]);
  const [number, sign] = split(200, 3);
  expect(number?.words).toEqual([percent.words[0]]);
  expect(sign?.words).toEqual([
    { text: '%', startMs: 0, endMs: 200 },
    { text: 'hoy', startMs: 400, endMs: 700 },
  ]);
  const attached = editCaptions([{ ...percent, text: '50% hoy' }], {
    type: 'split',
    id: percent.id,
    newId: 'after',
    atMs: 500,
    textIndex: 4,
  });
  expect(attached[0]?.words).toEqual(percent.words.slice(0, 2));
  // A mismatched temporal and textual cut must not assign the sign to the wrong side.
  expect(split(500, 3)[0]?.words).toEqual([percent.words[0]]);
});

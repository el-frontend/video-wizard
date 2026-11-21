import { expect, it } from 'vitest';
import { parseCaptionFile, serializeCaptionFile } from './caption-files';

it.each(['srt', 'vtt'] as const)(
  'round trips integer milliseconds and multiline Spanish in %s',
  (format) => {
    const cues = [{ id: 'a', startMs: 3745123, endMs: 3745999, text: '¡Qué día!\n¿Dónde está?' }];
    const file = serializeCaptionFile(cues, format);
    expect(file).toContain(format === 'srt' ? '01:02:25,123' : '01:02:25.123');
    expect(parseCaptionFile('\uFEFF' + file.replaceAll('\n', '\r\n'), format)).toEqual([
      { ...cues[0], id: expect.any(String) },
    ]);
  }
);
it('rejects malformed, reversed or empty input without dropping cues', () => {
  for (const block of [
    'bad',
    '00:00:01,000 --> 00:00:00,900\nVoz',
    '00:00:00,000 --> 00:00:01,000\n   ',
  ])
    expect(() => parseCaptionFile('1\n' + block, 'srt')).toThrow();
  expect(() => parseCaptionFile('1\n00:00:00.000 --> 00:00:01.000\nHola', 'vtt')).toThrow();
});
it('rejects a missing cue or header separator rather than dropping a caption', () => {
  const block = '00:01.100 --> 00:02.456\nUna línea';
  expect(() => parseCaptionFile('WEBVTT\n' + block + '\n\n' + block, 'vtt')).toThrow(/separa/i);
  expect(() => parseCaptionFile('WEBVTT\n\n' + block + '\n' + block, 'vtt')).toThrow(/separa/i);
  expect(parseCaptionFile('WEBVTT\n\nNOTE comentario\n\n' + block, 'vtt')[0]).toMatchObject({
    startMs: 1100,
    endMs: 2456,
    text: 'Una línea',
  });
});

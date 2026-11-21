import { CaptionInputSchema, type CaptionCue, type CaptionWord } from '@workspace/video-project';

export type CaptionEdit =
  | { type: 'add'; cue: CaptionCue }
  | { type: 'delete' | 'merge'; id: string }
  | { type: 'split'; id: string; newId: string; atMs: number; textIndex: number }
  | { type: 'update'; id: string; patch: Partial<Pick<CaptionCue, 'text' | 'startMs' | 'endMs'>> };

export function checkCue(cue: CaptionCue) {
  if (!CaptionInputSchema.safeParse(cue).success)
    throw new RangeError('Comprueba el texto, el intervalo y los tiempos de las palabras.');
}

function literalCaptionText(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/gu, '');
}

export function normalizedCaptionText(text: string) {
  return literalCaptionText(text).replace(/\p{P}/gu, '');
}

// Each searchable character points back to the original textarea selection offsets.
function spanFinder(graphemes: Intl.SegmentData[], normalize: (text: string) => string) {
  let searchable = '';
  const offsets: { start: number; end: number }[] = [];
  for (const { segment, index } of graphemes) {
    const value = normalize(segment);
    searchable += value;
    const span = { start: index, end: index + segment.length };
    for (let i = 0; i < value.length; i++) offsets.push(span);
  }
  let cursor = 0;
  return (word: string, after: number) => {
    if (!word) return undefined;
    while (cursor < offsets.length && offsets[cursor]!.start < after) cursor++;
    const at = searchable.indexOf(word, cursor);
    if (at < 0) return undefined;
    return { start: offsets[at]!.start, end: offsets[at + word.length - 1]!.end };
  };
}

function splitWordSpans(cue: CaptionCue, cut: number) {
  const left: CaptionWord[] = [],
    right: CaptionWord[] = [];
  if (!cue.words?.length) return { left, right };
  const graphemes = Array.from(
    new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(cue.text)
  );
  const findLexical = spanFinder(graphemes, normalizedCaptionText);
  const findLiteral = spanFinder(graphemes, literalCaptionText);
  let after = 0;
  for (const word of cue.words) {
    const token = normalizedCaptionText(word.text),
      literal = literalCaptionText(word.text);
    const lexicalSpan = findLexical(token, after);
    const literalSpan = literal !== token ? findLiteral(literal, after) : undefined;
    // Consume punctuation included in a measured spelling when both matches refer to that occurrence.
    const span =
      literalSpan && (!lexicalSpan || literalSpan.start <= lexicalSpan.start)
        ? literalSpan
        : lexicalSpan;
    if (!span) continue;
    after = span.end;
    if (span.end <= cut) left.push(word);
    else if (span.start >= cut) right.push(word);
  }
  return { left, right };
}

function sliceWords(cue: CaptionCue, startMs: number, endMs: number, source = cue.words ?? []) {
  const words: CaptionWord[] = [];
  for (const word of source) {
    const start = cue.startMs + word.startMs,
      end = cue.startMs + word.endMs;
    if (start >= startMs && end <= endMs)
      words.push({ ...word, startMs: start - startMs, endMs: end - startMs });
  }
  return words.length ? words : undefined;
}

export function editCaptions(cues: CaptionCue[], edit: CaptionEdit): CaptionCue[] {
  const next = [...cues].sort((a, b) => a.startMs - b.startMs);
  if (edit.type === 'add') {
    checkCue(edit.cue);
    if (next.some((cue) => cue.id === edit.cue.id))
      throw new RangeError('El identificador de subtítulo ya existe.');
    return [...next, edit.cue].sort((a, b) => a.startMs - b.startMs);
  }
  const i = next.findIndex((cue) => cue.id === edit.id),
    cue = next[i];
  if (!cue) throw new RangeError('El subtítulo ya no existe.');
  switch (edit.type) {
    case 'delete':
      next.splice(i, 1);
      break;
    case 'update': {
      const changed = { ...cue, ...edit.patch };
      if (
        changed.text === cue.text &&
        changed.startMs === cue.startMs &&
        changed.endMs === cue.endMs
      )
        return cues;
      changed.words =
        changed.text === cue.text ? sliceWords(cue, changed.startMs, changed.endMs) : undefined;
      checkCue(changed);
      next[i] = changed;
      break;
    }
    case 'split': {
      if (!Number.isInteger(edit.atMs) || edit.atMs <= cue.startMs || edit.atMs >= cue.endMs)
        throw new RangeError('Sitúa el cabezal dentro del subtítulo.');
      if (next.some((c) => c.id === edit.newId))
        throw new RangeError('El identificador de subtítulo ya existe.');
      const words = splitWordSpans(cue, edit.textIndex);
      const left = {
        ...cue,
        text: cue.text.slice(0, edit.textIndex).trimEnd(),
        endMs: edit.atMs,
        words: sliceWords(cue, cue.startMs, edit.atMs, words.left),
      };
      const right = {
        ...cue,
        id: edit.newId,
        text: cue.text.slice(edit.textIndex).trimStart(),
        startMs: edit.atMs,
        words: sliceWords(cue, edit.atMs, cue.endMs, words.right),
      };
      if (!left.text.trim() || !right.text.trim())
        throw new RangeError('Coloca el cursor entre los dos fragmentos de texto.');
      checkCue(left);
      checkCue(right);
      next.splice(i, 1, left, right);
      break;
    }
    case 'merge': {
      const after = next[i + 1];
      if (!after) throw new RangeError('Selecciona un subtítulo con otro a continuación.');
      const shift = after.startMs - cue.startMs;
      const words = [
        ...(cue.words ?? []),
        ...(after.words ?? []).map((w) => ({
          ...w,
          startMs: w.startMs + shift,
          endMs: w.endMs + shift,
        })),
      ];
      const joined = {
        ...cue,
        endMs: Math.max(cue.endMs, after.endMs),
        text: cue.text + ' ' + after.text,
        words: words.length ? words : undefined,
      };
      checkCue(joined);
      next.splice(i, 2, joined);
      break;
    }
  }
  return next.sort((a, b) => a.startMs - b.startMs);
}

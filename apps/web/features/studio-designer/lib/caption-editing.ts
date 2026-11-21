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

export function normalizedCaptionText(text: string) {
  return text
    .normalize('NFC')
    .replace(/[\s\p{P}]+/gu, '')
    .toLocaleLowerCase('es');
}

function sliceWords(
  cue: CaptionCue,
  startMs: number,
  endMs: number,
  textRange?: { from: number; to: number }
) {
  const display = textRange ? normalizedCaptionText(cue.text) : '';
  let cursor = 0;
  const words: CaptionWord[] = [];
  for (const word of cue.words ?? []) {
    if (textRange) {
      const token = normalizedCaptionText(word.text);
      if (!token) continue;
      const position = display.indexOf(token, cursor);
      if (position < 0) continue;
      cursor = position + token.length;
      if (position < textRange.from || cursor > textRange.to) continue;
    }
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
      const cut = normalizedCaptionText(cue.text.slice(0, edit.textIndex)).length;
      const left = {
        ...cue,
        text: cue.text.slice(0, edit.textIndex).trimEnd(),
        endMs: edit.atMs,
        words: sliceWords(cue, cue.startMs, edit.atMs, { from: 0, to: cut }),
      };
      const right = {
        ...cue,
        id: edit.newId,
        text: cue.text.slice(edit.textIndex).trimStart(),
        startMs: edit.atMs,
        words: sliceWords(cue, edit.atMs, cue.endMs, { from: cut, to: Infinity }),
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

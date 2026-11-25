// Motion Studio commits this digest after writing the episode and captions.
// Native JS serialization preserves its number representation and key ordering.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}
const state = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(
  createHash('sha256')
    .update(JSON.stringify(canonical(state)))
    .digest('hex')
    .slice(0, 24)
);

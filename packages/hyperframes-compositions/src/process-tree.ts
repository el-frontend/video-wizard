import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

export interface ProcessEntry {
  pid: number;
  parent: number;
  group: number;
  name: string;
}
export function processTable(): ProcessEntry[] {
  if (process.platform === 'linux') {
    const entries: ProcessEntry[] = [];
    for (const id of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
      try {
        const stat = readFileSync('/proc/' + id + '/stat', 'utf8');
        const end = stat.lastIndexOf(')');
        const [, parent, group] = stat.slice(end + 2).split(' ');
        entries.push({
          pid: Number(id),
          parent: Number(parent),
          group: Number(group),
          name: stat.slice(stat.indexOf('(') + 1, end),
        });
      } catch (error) {
        if (
          !['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(
            (error as NodeJS.ErrnoException).code ?? ''
          )
        )
          throw error;
      }
    }
    return entries;
  }
  // comm names the executable; never read command arguments, which can contain private inputs.
  const table = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,comm='], {
    encoding: 'utf8',
    maxBuffer: 8_000_000,
  });
  return table
    .trim()
    .split('\n')
    .flatMap((line) => {
      const values = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return values
        ? [
            {
              pid: Number(values[1]),
              parent: Number(values[2]),
              group: Number(values[3]),
              name: values[4]!,
            },
          ]
        : [];
    });
}
export function descendants(root: number, table = processTable()) {
  const children = new Map<number, ProcessEntry[]>();
  for (const entry of table) {
    const siblings = children.get(entry.parent) ?? [];
    siblings.push(entry);
    children.set(entry.parent, siblings);
  }
  const result = [...(children.get(root) ?? [])];
  for (const entry of result) result.push(...(children.get(entry.pid) ?? []));
  return result;
}

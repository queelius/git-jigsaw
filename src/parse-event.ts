import { load } from 'js-yaml';
import type { Event } from './puzzle';

export function parseCommitBody(yamlText: string, sha: string): Event {
  const parsed = load(yamlText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Commit body is not a YAML object');
  }
  const v = parsed['v'];
  if (typeof v !== 'number' || Math.floor(v) !== 1) {
    throw new Error(`Unsupported event version: ${v}`);
  }
  const op = parsed['op'];
  const actor = parsed['actor'];
  const ts = parsed['ts'];
  if (typeof op !== 'string' || typeof actor !== 'string') {
    throw new Error('Event missing op or actor');
  }
  return {
    ...parsed,
    op,
    actor,
    ts: typeof ts === 'string' ? ts : (ts instanceof Date ? ts.toISOString().replace(/\.\d{3}Z$/, 'Z') : String(ts)),
    v: 1,
    sha,
  } as Event;
}

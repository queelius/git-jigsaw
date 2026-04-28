import { describe, it, expect } from 'vitest';
import { parseCommitBody } from '../../src/parse-event';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('parseCommitBody', () => {
  it('parses a git-native-py-shaped place commit body', () => {
    const yaml = readFileSync(join(__dirname, '../fixtures/py-commit-body.yaml'), 'utf8');
    const event = parseCommitBody(yaml, 'sha-from-git');
    expect(event).toMatchObject({
      op: 'place',
      piece: 42,
      slot: [5, 2],
      actor: 'queelius',
      ts: '2026-04-27T14:23:11Z',
      v: 1,
      sha: 'sha-from-git',
    });
  });

  it('rejects unknown major version', () => {
    expect(() => parseCommitBody('op: place\nv: 2\n', 'x')).toThrow(/version/);
  });

  it('returns minor-version-tolerant for v: 1.5', () => {
    const yaml = 'op: place\npiece: 0\nslot: [0, 0]\nactor: a\nts: t\nv: 1\nextra: stuff\n';
    const e = parseCommitBody(yaml, 'x');
    expect(e.op).toBe('place');
  });
});

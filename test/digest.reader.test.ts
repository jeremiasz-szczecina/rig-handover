import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
  });

  it('counts runs and retries, keeps the last status and the offsets', () => {
    const row = night!.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      owner: 'rook',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a null owner', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row!.owner).toBeNull();
  });

  it('keeps the last error of a failed job', () => {
    const row = night!.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'latest.jsonl'), '');
    expect(readNight(dir, 'latest')).toBeNull();
    expect(readNight(dir, '../2026-01-01')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts bad lines without throwing and skips blank lines', () => {
    const lines = [
      '{"at":"2026-01-01T01:00:00+02:00","job":"a","status":"retry","owner":"x","error":"e1"}',
      'not json',
      '{"at":"2026-01-01T01:00:00+02:00","job":"a","status":"weird","owner":"x"}',
      '{"at":"2026-01-01T01:00:00+02:00","job":"","status":"ok","owner":"x"}',
      '',
      '{"at":"2026-01-01T02:00:00+02:00","job":"a","status":"ok","owner":null}',
    ];
    writeFileSync(join(dir, '2026-01-01.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-01-01');
    expect(night!.badLines).toBe(3);
    expect(night!.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(night!.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-01T01:00:00+02:00',
        lastAt: '2026-01-01T02:00:00+02:00',
      },
    ]);
  });
});

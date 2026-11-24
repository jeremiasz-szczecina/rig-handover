import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Fixtures live in a temp dir; runs/ is read-only and never touched here.
let runsDir: string;
let app: ReturnType<typeof createApp>;

const line = (job: string, status: 'ok' | 'retry' | 'fail' = 'ok') =>
  JSON.stringify({ at: '2026-01-01T06:00:00+01:00', job, status, owner: 'me' });

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  // Good night: two jobs, written b before a so the page must sort them.
  writeFileSync(join(runsDir, '2026-01-01.jsonl'), [line('b/job'), line('a/job', 'retry')].join('\n') + '\n');
  // Empty night: a file with no lines.
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
  // Bad-line night: one valid line, one line that is not JSON.
  writeFileSync(join(runsDir, '2026-01-03.jsonl'), line('a/job') + '\n' + 'this is not json\n');

  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

type JsonDigest = {
  night: string;
  rows: { job: string }[];
  badLines: number;
  counts: Record<string, number>;
};

const jobsInOrder = (html: string, jobs: string[]) => jobs.map((job) => html.indexOf(job));

describe('digest page', () => {
  it('200 for a good night, with both jobs sorted by job name', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
    const [a, b] = jobsInOrder(html, ['a/job', 'b/job']);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('200 with "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-01-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('200 for a night with a bad line, showing the valid job', async () => {
    const res = await app.request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/job');
  });
});

describe('digest JSON', () => {
  it('200 for a good night, rows mapped to a/job then b/job', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonDigest;
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
  });

  it('404 with JSON for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual(expect.any(Object));
  });

  it('empty night has rows []', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonDigest;
    expect(body.rows).toEqual([]);
  });

  it('bad-line night counts the bad line and keeps the valid row', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonDigest;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-01-01', '2026-01-02', '2026-01-03'])(
    'same jobs in the same order for %s',
    async (night) => {
      const json = (await (await app.request(`/api/digest/${night}`)).json()) as JsonDigest;
      const html = await (await app.request(`/digest/${night}`)).text();
      const jobs = json.rows.map((r) => r.job);
      const positions = jobsInOrder(html, jobs);
      for (const pos of positions) expect(pos).toBeGreaterThanOrEqual(0);
      expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    },
  );
});

// Runs only against an isolated local workspace and the built-in practice form.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder = await mkdtemp(path.join(tmpdir(), 'apply-jobs-workflow-'));
const port = 14318;
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), APPLY_JOBS_DATA: folder, APPLY_JOBS_HEADLESS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout?.on('data', (b) => (logs += b));
child.stderr?.on('data', (b) => (logs += b));
async function api(route: string, body?: unknown, method?: string) {
  const r = await fetch(base + '/api' + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers:
      body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Apply-Jobs': 'local' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error(d.error);
  return d;
}
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
async function waitFor(fn: () => Promise<any>, predicate: (x: any) => boolean, timeout = 50000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (predicate(value)) return value;
    } catch {}
    await sleep(300);
  }
  throw new Error('Timed out. ' + logs);
}
try {
  await waitFor(
    () => api('/health'),
    (x) => x.status === 'ok',
  );
  const state = await api('/state');
  await api(
    '/profile',
    {
      ...state.profile,
      name: 'Alex Workflow',
      email: 'alex@example.com',
      location: 'Chicago',
      headline: 'Product Engineer',
      experience: 'Example Co · Engineer · 2022–2025\nBuilt accessible software.',
      skills: 'React, TypeScript',
      confirmed: true,
    },
    'PUT',
  );
  const j = await api('/practice', {});
  const a = await api(`/jobs/${j.id}/apply`, {});
  const duplicate = await api(`/jobs/${j.id}/apply`, {});
  assert.equal(a.id, duplicate.id);
  await api(`/applications/${a.id}/resume`, {});
  let current = await waitFor(
    () => api('/state'),
    (s) => s.applications[0].stage === 'needs_user',
  );
  let app = current.applications[0];
  assert.match(app.message, /required/);
  const question = app.fields.find((f: any) => f.label.includes('What kind'));
  assert.ok(question);
  await api(`/applications/${a.id}/answers`, {
    answers: [
      {
        id: question.id,
        value: 'I am looking for thoughtful product engineering work.',
        save: true,
      },
    ],
  });
  await api(`/applications/${a.id}/resume`, {});
  current = await waitFor(
    () => api('/state'),
    (s) => s.applications[0].stage === 'review',
  );
  app = current.applications[0];
  await assert.rejects(
    api(`/applications/${a.id}/approve`, { snapshotHash: 'stale' }),
    /out of date/,
  );
  await api('/pause', { paused: true });
  await assert.rejects(
    api(`/applications/${a.id}/approve`, { snapshotHash: app.snapshotHash }),
    /paused/,
  );
  await api('/pause', { paused: false });
  await api(`/applications/${a.id}/approve`, { snapshotHash: app.snapshotHash });
  current = await api('/state');
  assert.equal(current.applications[0].stage, 'submitted');
  assert.equal(current.applications[0].receipt.practice, true);
  assert.match(current.applications[0].receipt.confirmation, /Thank you/);
  assert.equal(current.applications.length, 1);
  assert.ok((await readFile(path.join(folder, 'documents', `${a.id}.pdf`))).length > 500);
  console.log(
    'PASS: practice fill → required answer → saved answer → review → stale-approval block → pause block → submit → receipt; duplicate prevented.',
  );
  // Simulate persisted in-flight submission and verify restart never retries it.
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(folder, 'apply-jobs.sqlite'));
  const row = db.prepare('SELECT data FROM applications WHERE id=?').get(a.id) as { data: string };
  const stored = JSON.parse(row.data);
  stored.stage = 'submitting';
  stored.receipt = null;
  db.prepare('UPDATE applications SET stage=?,data=? WHERE id=?').run(
    'submitting',
    JSON.stringify(stored),
    a.id,
  );
  db.close();
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), APPLY_JOBS_DATA: folder, APPLY_JOBS_HEADLESS: '1' },
    stdio: 'ignore',
  });
  current = await waitFor(
    () => api('/state'),
    (s) => s.applications[0].stage === 'unknown',
  );
  assert.equal(current.applications[0].attempts, app.attempts);
  console.log('PASS: restart during submission → unknown outcome; no automatic retry.');
} finally {
  child.kill('SIGTERM');
  await sleep(600);
  await rm(folder, { recursive: true, force: true });
}

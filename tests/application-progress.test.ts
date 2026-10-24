import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.APPLY_JOBS_DATA = mkdtempSync(path.join(tmpdir(), 'application-progress-'));
const store = await import('../server/store.ts');
test('application history survives reads, remains bounded and clears stale wait state', () => {
  const job = store.putJob({
    id: store.id(),
    canonicalKey: 'progress:test',
    url: 'https://example.com/job',
    title: 'Engineer',
    company: 'Example',
    location: 'US',
    description: '',
    ats: 'custom',
    source: 'test',
    score: 80,
    reasons: [],
    createdAt: store.now(),
    status: 'open',
    practice: true,
  });
  const id = store.id();
  store.saveApplication({
    id,
    jobId: job.id,
    job,
    stage: 'queued',
    message: 'Queued',
    fields: [],
    packet: null,
    profileVersion: 0,
    revision: 0,
    snapshotHash: '',
    receipt: null,
    createdAt: store.now(),
    updatedAt: store.now(),
    attempts: 0,
    error: '',
  });
  store.update(id, {
    stage: 'needs_user',
    waitingFor: 'authentication',
    message: 'Sign in required',
  });
  assert.equal(store.application(id)?.waitingFor, 'authentication');
  store.update(id, { stage: 'filling', message: 'Continuing automatically' });
  assert.equal(store.application(id)?.waitingFor, undefined);
  for (let i = 0; i < 45; i++) store.update(id, { message: `Completed step ${i}` });
  const saved = store.application(id)!;
  assert.equal(saved.progress?.length, 40);
  assert.equal(saved.progress?.at(-1)?.message, 'Completed step 44');
  store.update(id, { message: 'Completed step 44' });
  assert.equal(store.application(id)?.progress?.length, 40);
});

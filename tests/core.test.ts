import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.APPLY_JOBS_DATA = mkdtempSync(path.join(tmpdir(), 'apply-jobs-unit-'));
const { blankProfile, defaultSettings, db } = await import('../server/store.ts');
const { answerField } = await import('../server/answers.ts');
const { eligible, rank, canonical } = await import('../server/jobs.ts');
const { privateIP, publicURL } = await import('../server/network.ts');
const { preparePacket } = await import('../server/llm.ts');
const { renderPDF, textFromPDF } = await import('../server/documents.ts');
import { readFile } from 'node:fs/promises';
import type { Job, Field } from '../src/types.ts';
const profile = {
  ...blankProfile,
  name: 'Alex Example',
  email: 'alex@example.com',
  location: 'Chicago',
  skills: 'TypeScript, React',
  experience: 'Example Co · Engineer · 2022–2025\nBuilt accessible interfaces.',
  education: 'Example University · BS Computer Science · 2021',
  projects: 'Open Dashboard · TypeScript\nBuilt a public data dashboard.',
  confirmed: true,
};
const job: Job = {
  id: 'job',
  title: 'Frontend Engineer',
  description: 'Build with React and TypeScript',
  company: 'Example Co',
  location: 'Remote',
  url: 'https://jobs.lever.co/example/123',
  canonicalKey: 'x',
  ats: 'lever',
  source: 'test',
  score: 90,
  reasons: [],
  status: 'open',
  practice: false,
  createdAt: new Date().toISOString(),
};
test('candidate facts answer matching fields; missing authorization stays unknown', () => {
  const field: Field = {
    id: '1',
    label: 'Email address',
    type: 'email',
    required: true,
    options: [],
    value: '',
    answer: '',
    source: '',
    resolved: false,
  };
  assert.equal(answerField(field, profile).answer, 'alex@example.com');
  const work = answerField({ ...field, label: 'Are you legally authorized to work?' }, profile);
  assert.equal(work.resolved, false);
  assert.equal(work.answer, '');
});
test('Autopilot applies hard exclusions and role/location filters even at a zero score threshold', () => {
  const s = { ...defaultSettings, minScore: 0, excludedCompanies: 'Example' };
  assert.equal(eligible(job, s), false);
  assert.equal(eligible(job, { ...s, excludedCompanies: '', roles: 'Designer' }), false);
  assert.equal(eligible(job, { ...s, excludedCompanies: '', locations: 'London' }), false);
  assert.equal(
    eligible(job, { ...s, excludedCompanies: '', roles: 'Frontend', locations: 'Remote' }),
    true,
  );
  assert.equal(
    canonical('https://jobs.lever.co/example/123?utm_source=x#apply'),
    'https://jobs.lever.co/example/123',
  );
  assert.equal(
    canonical('https://jobs.lever.co/example/123/apply'),
    canonical('https://jobs.lever.co/example/123'),
  );
  assert.equal(
    canonical('https://boards.greenhouse.io/example/jobs/123'),
    canonical('https://job-boards.greenhouse.io/example/jobs/123'),
  );
});
test('local network destinations cannot be imported as external jobs', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '::1',
    'fd00::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(privateIP(ip), true);
  assert.equal(privateIP('8.8.8.8'), false);
  await assert.rejects(publicURL('http://127.0.0.1:4318/practice'));
  await assert.rejects(publicURL('file:///etc/passwd'));
});
test('résumé preparation preserves candidate text and the PDF round-trips as selectable text', async () => {
  const packet = await preparePacket(profile, job, false);
  assert.ok(packet.resumeText.includes(profile.experience));
  const file = await renderPDF('test-document', packet.resumeText);
  const text = await textFromPDF(await readFile(file));
  assert.match(text, /Alex Example/);
  assert.match(text, /accessible interfaces/);
  assert.match(text, /PROJECTS/);
  assert.match(text, /Open Dashboard/);
  const { resumeSections } = await import('../server/resume-sections.ts');
  const sections = resumeSections(text);
  assert.match(sections.experience, /accessible interfaces/);
  assert.match(sections.education, /Example University/);
  assert.match(sections.projects, /public data dashboard/);
  assert(!sections.education.includes('Open Dashboard'));
});

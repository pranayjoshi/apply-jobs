import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.APPLY_JOBS_DATA = mkdtempSync(path.join(tmpdir(), 'apply-jobs-upgrade-'));
const store = await import('../server/store.ts');
const { fromSource, reconcileSnapshot, matches, parseBoard } =
  await import('../server/discovery.ts');
const { setSecrets, secret, secretStatus } = await import('../server/secrets.ts');
const { makePairCode, pairExtension, authorizedExtension } = await import('../server/extension.ts');
const { classifyMail, matchMail } = await import('../server/inbox.ts');
import type { WatchSource, Job, Application } from '../src/types.ts';
const source: WatchSource = {
  id: store.id(),
  ats: 'greenhouse',
  board: 'example',
  label: 'Example',
  lastSync: '',
  lastError: '',
  enabled: true,
};
test('freshness reconciles complete snapshots, preserves partial results, and retains active cross-source observations', () => {
  const j = fromSource(source, {
    id: 1,
    title: 'Senior Frontend Engineer',
    absolute_url: 'https://boards.greenhouse.io/example/jobs/1',
    location: { name: 'Remote' },
    content: 'React role',
  })!;
  reconcileSnapshot(source, [j], true);
  const saved = store.jobs().find((x) => x.canonicalKey === j.canonicalKey)!;
  reconcileSnapshot(source, [], false);
  assert.equal(store.job(saved.id)!.status, 'open');
  const other = { ...source, id: store.id(), ats: 'remotive' as const };
  store.putJob({
    ...saved,
    observations: [{ sourceId: other.id, active: true, lastSeenAt: store.now() }],
  });
  reconcileSnapshot(source, [], true);
  assert.equal(store.job(saved.id)!.status, 'open');
  reconcileSnapshot(other, [], true);
  assert.equal(store.job(saved.id)!.status, 'stale');
  const second = fromSource(source, {
    id: 2,
    title: 'Engineer',
    absolute_url: 'https://boards.greenhouse.io/example/jobs/2',
    location: { name: 'Chicago' },
  })!;
  reconcileSnapshot(source, [second], true);
  reconcileSnapshot(source, [], true);
  assert.equal(store.jobs().find((x) => x.canonicalKey === second.canonicalKey)!.status, 'closed');
});
test('discovery normalizes source dates and applies salary, remote, age and profile filters without inventing missing values', () => {
  const s = { ...source, id: store.id(), ats: 'arbeitnow' as const };
  const j = fromSource(s, {
    slug: 'one',
    title: 'Senior Software Engineer',
    company_name: 'Acme',
    remote: true,
    location: 'Remote',
    description: 'TypeScript',
    created_at: Math.floor(Date.now() / 1000),
    url: 'https://www.arbeitnow.com/jobs/one',
  })!;
  assert.ok(j.publishedAt);
  assert.equal(j.remote, true);
  assert.equal(j.seniority, 'senior');
  assert.equal(
    matches(j, {
      ...store.defaultSettings,
      roles: 'Software',
      locations: 'Remote',
      remoteOnly: true,
    }),
    true,
  );
  assert.equal(matches(j, { ...store.defaultSettings, requireSalary: true }), false);
  assert.equal(
    matches(
      { ...j, salaryMin: 100000, salaryMax: 120000, salaryCurrency: 'USD', salaryPeriod: 'year' },
      { ...store.defaultSettings, minSalary: 130000, currency: 'USD' },
    ),
    false,
  );
  assert.deepEqual(parseBoard('https://apply.workable.com/acme/').board, 'acme');
  assert.equal(parseBoard('https://jobs.eu.lever.co/acme/').region, 'eu');
});
test('secrets remain encrypted and extension tokens are bound to the paired extension origin', () => {
  setSecrets({ modelApiKey: 'synthetic-key-123' });
  assert.equal(secret('modelApiKey'), 'synthetic-key-123');
  assert.equal(secretStatus().modelApiKey, true);
  assert.ok(
    !readFileSync(path.join(store.dataDir, 'vault.enc')).includes(Buffer.from('synthetic-key-123')),
  );
  const origin = 'chrome-extension://' + 'a'.repeat(32),
    different = 'chrome-extension://' + 'b'.repeat(32);
  const { code } = makePairCode();
  const { token } = pairExtension(origin, code);
  assert.ok(authorizedExtension(origin, 'Bearer ' + token));
  assert.ok(!authorizedExtension(different, 'Bearer ' + token));
  assert.ok(!authorizedExtension(origin, 'Bearer wrong'));
  assert.throws(() => pairExtension(origin, code));
});
test('mail links require unambiguous company and role evidence and do not alter submission confirmation', () => {
  const j = fromSource(source, {
    id: 3,
    title: 'Frontend Engineer',
    absolute_url: 'https://boards.greenhouse.io/example/jobs/3',
  })!;
  const a = { id: 'application', job: j, stage: 'submitted' } as Application;
  assert.equal(
    classifyMail('Your application', 'Unfortunately we are not proceeding'),
    'rejection',
  );
  assert.equal(classifyMail('Interview invitation', 'Schedule a call'), 'interview');
  assert.equal(
    matchMail('Application', 'Example Frontend Engineer', [a])?.applicationId,
    'application',
  );
  assert.equal(
    matchMail('Application', 'Example Frontend Engineer', [a, { ...a, id: 'other' }]),
    undefined,
  );
  assert.equal(matchMail('Application', 'Example', [a]), undefined);
  assert.equal(a.stage, 'submitted');
});
test('ATS field inspection and browser filling handle wrapper labels, selected options and accessible radio groups', async () => {
  const { chromium } = await import('playwright');
  const { inspectFormFrame, fillFormField } = await import('../server/worker.ts');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<div data-automation-id="formField-firstName"><label data-automation-id="formLabel">First Name *</label><input placeholder="Type here" name="firstName"></div><label>Authorized to work<select required><option value="">Choose</option><option>Yes</option><option>No</option></select></label><fieldset><legend>Require sponsorship?</legend><label><input type="radio" name="sponsor" value="yes" required>Yes</label><label><input type="radio" name="sponsor" value="no">No</label></fieldset>`,
    );
    const fields = await inspectFormFrame(page.mainFrame(), 0, 'workday');
    assert.equal(fields[0].label, 'First Name *');
    assert.equal(fields[0].required, true);
    await fillFormField(page, fields[0], 'Alex', 'fixture');
    await fillFormField(page, fields[1], 'Yes', 'fixture');
    await fillFormField(page, fields[2], 'No', 'fixture');
    assert.equal(await page.locator('input[name=firstName]').inputValue(), 'Alex');
    assert.equal(await page.locator('select').inputValue(), 'Yes');
    assert.equal(await page.locator('input[value=no]').isChecked(), true);
  } finally {
    await browser.close();
  }
});

test('résumé extraction drafts a missing summary, preserves existing summaries and keeps facts if drafting fails', async () => {
  const { extractResume, draftProfileSummary } = await import('../server/llm.ts');
  const previousSettings = store.settings();
  const originalFetch = globalThis.fetch;
  store.setKV('settings', {
    ...previousSettings,
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'fixture',
  });
  const extracted = {
    name: 'Alex Example',
    email: '',
    phone: '',
    location: '',
    headline: '',
    linkedin: '',
    website: '',
    summary: '',
    projects: '',
    experience: '',
    education: '',
    skills: 'TypeScript, SQL',
    employmentHistory: [
      {
        company: 'Example Co',
        title: 'Engineer',
        start: '2021',
        end: '2024',
        description: 'Built TypeScript services.',
      },
    ],
    educationHistory: [
      {
        school: 'Example University',
        degree: 'BS',
        field: 'Computer Science',
        start: '2017',
        end: '2021',
      },
    ],
  };
  let summaryCalls = 0,
    failDraft = false;
  globalThis.fetch = (async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    const drafting = body.messages[0].content.includes(
      'Write a concise professional résumé summary',
    );
    if (drafting) {
      summaryCalls++;
      const input = JSON.parse(body.messages[1].content);
      assert.match(input.experience, /Example Co/);
      assert.equal(input.skills, 'TypeScript, SQL');
      if (failDraft) return new Response('Model unavailable', { status: 503 });
    }
    return Response.json({
      message: {
        content: JSON.stringify(
          drafting
            ? {
                summary: 'Engineer with experience building TypeScript services and skills in SQL.',
              }
            : extracted,
        ),
      },
    });
  }) as typeof fetch;
  try {
    const result = await extractResume(
      'Engineer at Example Co. Built TypeScript services. BS Computer Science.',
    );
    assert.match(result.summary, /TypeScript services/);
    assert.match(result.experience, /Example Co · Engineer/);
    assert.match(result.education, /Example University · BS · Computer Science/);
    assert.equal(summaryCalls, 1);
    extracted.summary = 'Existing résumé summary.';
    assert.equal((await extractResume('Résumé with its own summary.')).summary, extracted.summary);
    assert.equal(summaryCalls, 1);
    const sectioned = await extractResume(
      'Alex Example\nEDUCATION\nExample University — BS Computer Science, 2021\nPROFESSIONAL EXPERIENCE\nExample Co — Engineer, 2021–2024\nBuilt TypeScript services.\nSELECTED PROJECTS\nOpen Dashboard — TypeScript, SQL\nBuilt public dashboards.\nCERTIFICATIONS\nUnrelated certificate',
    );
    assert.match(sectioned.education, /Example University/);
    assert.match(sectioned.experience, /Built TypeScript services/);
    assert.match(sectioned.projects, /Open Dashboard/);
    assert(!sectioned.projects.includes('Unrelated certificate'));
    extracted.summary = '';
    failDraft = true;
    const partial = await extractResume('Engineer at Example Co.');
    assert.match(partial.experience, /Example Co/);
    assert.match(partial.summaryDraftError, /503/);
    await assert.rejects(draftProfileSummary(store.blankProfile), /Add your résumé/);
  } finally {
    globalThis.fetch = originalFetch;
    store.setKV('settings', previousSettings);
  }
});

test('application navigation advances dynamic steps and exposes invalid fields instead of looping clicks', async () => {
  const { chromium } = await import('playwright');
  const { findButton, advancePage, formProblems } = await import('../server/adapters.ts');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<form><label>Email<input type="email" required></label><button type="submit">Continue to review</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.body.innerHTML='<h1>Review application</h1><button>Submit your application</button>'}</script>`,
    );
    let next = await findButton(page, 'next');
    assert(next);
    assert.equal(await advancePage(page, next), false);
    assert.equal((await formProblems(page)).length, 1);
    await page.getByLabel('Email').fill('alex@example.test');
    assert.equal(await advancePage(page, next), true);
    assert(await findButton(page, 'submit'));
  } finally {
    await browser.close();
  }
});

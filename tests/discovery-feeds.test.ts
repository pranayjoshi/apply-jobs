import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.APPLY_JOBS_DATA = mkdtempSync(path.join(tmpdir(), 'discovery-feeds-'));
const { parseJobFeed, fromSource, catalog, jobCountries, workdayBoard, parseBoard } =
  await import('../server/discovery.ts');
const source = (ats: any) => ({
  id: 'feed',
  ats,
  board: '',
  label: '',
  enabled: true,
  lastSync: '',
  lastError: '',
});
test('RSS and Atom preserve application links, descriptions and publication dates', () => {
  const rss = parseJobFeed(
    '<rss><channel><item><title>Acme: Engineer</title><link>https://example.com/jobs/1</link><description><![CDATA[Build things]]></description><pubDate>Fri, 23 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>',
  );
  assert.equal(rss[0].company, 'Acme');
  assert.equal(rss[0].title, 'Engineer');
  assert.equal(rss[0].url, 'https://example.com/jobs/1');
  const atom = parseJobFeed(
    '<feed><entry><title>Designer</title><link rel="alternate" href="https://example.com/jobs/2"/><summary>Design things</summary></entry></feed>',
  );
  assert.equal(atom[0].url, 'https://example.com/jobs/2');
  assert.throws(() => parseJobFeed('<html>Error</html>'), /Expected/);
});
test('new feeds retain logo, attribution, expiry and salary without unsafe logo schemes', () => {
  const job = fromSource(source('himalayas'), {
    title: 'Engineer',
    companyName: 'Acme',
    applicationLink: 'https://example.com/apply',
    companyLogo: 'https://example.com/logo.png',
    locationRestrictions: ['US'],
    pubDate: 1792756800,
    expiryDate: 1892756800,
    minSalary: 100000,
    currency: 'USD',
  });
  assert.equal(job?.companyLogo, 'https://example.com/logo.png');
  assert.equal(job?.attribution?.name, 'Himalayas');
  assert.equal(job?.salaryMin, 100000);
  assert.ok(job?.validThrough);
  const invalid = fromSource(source('jobicy'), {
    jobTitle: 'Engineer',
    companyName: 'Acme',
    url: 'https://jobicy.com/jobs/1',
    companyLogo: 'javascript:alert(1)',
  });
  assert.equal(invalid?.companyLogo, undefined);
  assert.equal(catalog.find((x) => x.kind === 'jobicy')?.minIntervalMinutes, 60);
  assert.equal(catalog.find((x) => x.kind === 'himalayas')?.minIntervalMinutes, 1440);
});

test('countries distinguish US states, explicit countries and unknown locations', () => {
  assert.deepEqual(jobCountries({ location: 'Chicago, IL' }), ['United States']);
  assert.deepEqual(jobCountries({ location: 'Paris, France' }), ['France']);
  assert.deepEqual(jobCountries({ location: 'Toronto, ON, Canada' }), ['Canada']);
  assert.deepEqual(jobCountries({ location: 'Remote' }), []);
});
test('Workday parsing accepts employer boards and rejects unrelated hosts', () => {
  assert.equal(
    workdayBoard('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/123')
      .site,
    'NVIDIAExternalCareerSite',
  );
  assert.equal(
    parseBoard('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite').ats,
    'workday',
  );
  assert.throws(() => workdayBoard('https://example.com/jobs'));
  const j = fromSource(source('simplify'), {
    active: true,
    is_visible: true,
    title: 'Engineer',
    company_name: 'Example',
    url: 'https://example.com/job',
    locations: ['Chicago, IL'],
    date_posted: 1792756800,
    _repo: 'https://github.com/SimplifyJobs/New-Grad-Positions',
  });
  assert.equal(j?.attribution?.name, 'SimplifyJobs');
  assert.equal(fromSource(source('simplify'), { active: false }), undefined);
});

import * as cheerio from 'cheerio';
import type { Job, WatchSource, SourceCatalogItem, DiscoveryRun, Settings } from '../src/types.ts';
import { publicFetch, publicURL } from './network.ts';
import { secret, redact } from './secrets.ts';
import * as store from './store.ts';
import { canonical, detectATS, includesTerm, rank } from './jobs.ts';
export const catalog: SourceCatalogItem[] = [
  {
    kind: 'greenhouse',
    name: 'Greenhouse',
    description: 'Public company career boards',
    requiresBoard: true,
    requiresKey: false,
    minIntervalMinutes: 30,
    attribution: 'Employer career page',
    docs: 'https://docs.greenhouse.io/job-board',
  },
  {
    kind: 'lever',
    name: 'Lever',
    description: 'Global and European company career boards',
    requiresBoard: true,
    requiresKey: false,
    minIntervalMinutes: 30,
    attribution: 'Employer career page',
    docs: 'https://github.com/lever/postings-api',
  },
  {
    kind: 'ashby',
    name: 'Ashby',
    description: 'Direct employer job postings and compensation',
    requiresBoard: true,
    requiresKey: false,
    minIntervalMinutes: 30,
    attribution: 'Employer career page',
    docs: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
  },
  {
    kind: 'smartrecruiters',
    name: 'SmartRecruiters',
    description: 'Public employer postings, with pagination',
    requiresBoard: true,
    requiresKey: false,
    minIntervalMinutes: 60,
    attribution: 'Employer career page',
    docs: 'https://developers.smartrecruiters.com/docs/endpoints',
  },
  {
    kind: 'workable',
    name: 'Workable',
    description: 'Published company jobs and application links',
    requiresBoard: true,
    requiresKey: false,
    minIntervalMinutes: 60,
    attribution: 'Employer career page',
    docs: 'https://workable.readme.io/reference/jobs-1',
  },
  {
    kind: 'remotive',
    name: 'Remotive',
    description: 'Remote jobs worldwide. Feed is delayed by 24 hours.',
    requiresBoard: false,
    requiresKey: false,
    minIntervalMinutes: 360,
    attribution: 'Remotive',
    docs: 'https://github.com/remotive-com/remote-jobs-api',
  },
  {
    kind: 'remoteok',
    name: 'Remote OK',
    description: 'Remote opportunities with original source links',
    requiresBoard: false,
    requiresKey: false,
    minIntervalMinutes: 60,
    attribution: 'Remote OK',
    docs: 'https://remoteok.com/api',
  },
  {
    kind: 'arbeitnow',
    name: 'Arbeitnow',
    description: 'Remote and European roles. Updated hourly.',
    requiresBoard: false,
    requiresKey: false,
    minIntervalMinutes: 60,
    attribution: 'Arbeitnow',
    docs: 'https://www.arbeitnow.com/api/job-board-api',
  },
  {
    kind: 'adzuna',
    name: 'Adzuna',
    description: 'Country-based job search using your API account',
    requiresBoard: true,
    requiresKey: true,
    minIntervalMinutes: 60,
    attribution: 'Adzuna',
    docs: 'https://developer.adzuna.com/overview',
  },
  {
    kind: 'usajobs',
    name: 'USAJOBS',
    description: 'Open US federal announcements; free API registration',
    requiresBoard: false,
    requiresKey: true,
    minIntervalMinutes: 60,
    attribution: 'USAJOBS',
    docs: 'https://developer.usajobs.gov/apirequest/index',
  },
  {
    kind: 'jooble',
    name: 'Jooble',
    description: 'Keyword and location search using your API key',
    requiresBoard: false,
    requiresKey: true,
    minIntervalMinutes: 60,
    attribution: 'Jooble',
    docs: 'https://jooble.org/api/about',
  },
];
const text = (html: unknown) =>
  cheerio
    .load(String(html || ''))
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000);
const iso = (v: unknown) => {
  if (!v) return undefined;
  const d = new Date(typeof v === 'number' ? v * 1000 : String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const jobType = (v: unknown) =>
  String(v || '')
    .toLowerCase()
    .replace(/[_\s-]/g, '')
    .replace('permanent', 'fulltime');
export function level(title: string) {
  if (/intern|apprentice/i.test(title)) return 'intern';
  if (/junior|\bjr\b|entry.level|graduate/i.test(title)) return 'junior';
  if (/director|head of|\bvp\b|manager/i.test(title)) return 'manager';
  if (/lead|staff|principal/i.test(title)) return 'lead';
  if (/senior|\bsr\b/i.test(title)) return 'senior';
  return 'unknown';
}
export function fromSource(s: WatchSource, x: any): Job | undefined {
  let url = '',
    title = '',
    company = '',
    location = '',
    description = '',
    publishedAt: unknown,
    validThrough: unknown,
    remote = false,
    employmentType = '',
    salaryMin: number | undefined,
    salaryMax: number | undefined,
    salaryCurrency = '',
    salaryPeriod = '',
    externalId = String(x.id || x.slug || x.shortcode || x.code || '');
  let attribution: Job['attribution'];
  switch (s.ats) {
    case 'greenhouse':
      url = x.absolute_url;
      title = x.title;
      company = s.label || s.board;
      location = x.location?.name || '';
      description = x.content;
      publishedAt = x.first_published;
      break;
    case 'lever':
      url = x.applyUrl || x.hostedUrl;
      title = x.text;
      company = s.label || s.board;
      location = x.categories?.location || '';
      description = [
        x.description,
        ...(x.lists || []).map((l: any) => l.text + ' ' + l.content),
        x.additional,
      ].join(' ');
      employmentType = x.categories?.commitment;
      remote = x.workplaceType === 'remote';
      if (x.salaryRange) {
        salaryMin = x.salaryRange.min;
        salaryMax = x.salaryRange.max;
        salaryCurrency = x.salaryRange.currency;
        salaryPeriod = x.salaryRange.interval;
      }
      break;
    case 'ashby':
      if (x.isListed === false) return;
      url = x.applyUrl || x.jobUrl;
      title = x.title;
      company = s.label || s.board;
      location = x.location;
      description = x.descriptionHtml || x.descriptionPlain;
      publishedAt = x.publishedAt;
      remote = x.isRemote;
      employmentType = x.employmentType;
      {
        const c = x.compensation?.summaryComponents?.find(
          (c: any) => c.compensationType === 'Salary',
        );
        if (c) {
          salaryMin = c.minValue;
          salaryMax = c.maxValue;
          salaryCurrency = c.currencyCode;
          salaryPeriod = c.interval;
        }
      }
      break;
    case 'workable':
      url = x.application_url || x.url || x.shortlink;
      title = x.title;
      company = s.label || s.board;
      location = [x.city, x.state, x.country].filter(Boolean).join(', ');
      description = x.description;
      publishedAt = x.published_on || x.created_at;
      remote = x.telecommuting || x.workplace_type === 'remote';
      employmentType = x.employment_type;
      break;
    case 'smartrecruiters':
      if (x.active === false) return;
      url =
        x.applyUrl ||
        x.postingUrl ||
        `https://jobs.smartrecruiters.com/${encodeURIComponent(s.board)}/${x.id}`;
      title = x.name;
      company = x.company?.name || s.label || s.board;
      location = [x.location?.city, x.location?.country].filter(Boolean).join(', ');
      description = Object.values(x.jobAd?.sections || {})
        .map((v: any) => v.text || '')
        .join(' ');
      publishedAt = x.releasedDate;
      remote = x.location?.remote;
      employmentType = x.typeOfEmployment?.label;
      break;
    case 'remotive':
      url = x.url;
      title = x.title;
      company = x.company_name;
      location = x.candidate_required_location || 'Remote';
      description = x.description;
      publishedAt = x.publication_date;
      remote = true;
      employmentType = x.job_type;
      attribution = { name: 'Remotive', url: x.url };
      break;
    case 'remoteok':
      if (!x.id) return;
      url = x.apply_url || x.url;
      title = x.position;
      company = x.company;
      location = x.location || 'Remote';
      description = x.description;
      publishedAt = x.date || x.epoch;
      remote = true;
      salaryMin = x.salary_min || undefined;
      salaryMax = x.salary_max || undefined;
      salaryCurrency = 'USD';
      salaryPeriod = 'year';
      attribution = { name: 'Remote OK', url: x.url };
      break;
    case 'arbeitnow':
      url = x.url;
      title = x.title;
      company = x.company_name;
      location = x.location;
      description = x.description;
      publishedAt = x.created_at;
      remote = x.remote;
      employmentType = (x.job_types || [])[0];
      attribution = { name: 'Arbeitnow', url: x.url };
      break;
    case 'adzuna':
      url = x.redirect_url;
      title = x.title;
      company = x.company?.display_name;
      location = x.location?.display_name;
      description = x.description;
      publishedAt = x.created;
      salaryMin = x.salary_min;
      salaryMax = x.salary_max;
      salaryCurrency =
        s.board === 'gb' ? 'GBP' : s.board === 'us' ? 'USD' : s.board === 'ca' ? 'CAD' : 'EUR';
      salaryPeriod = 'year';
      employmentType = x.contract_time || x.contract_type;
      attribution = { name: 'Adzuna', url: x.redirect_url };
      break;
    case 'usajobs':
      {
        const d = x.MatchedObjectDescriptor;
        if (!d) return;
        url = d.ApplyURI?.[0] || d.PositionURI;
        title = d.PositionTitle;
        company = d.OrganizationName;
        location = d.PositionLocationDisplay;
        description = d.UserArea?.Details?.JobSummary || d.QualificationSummary;
        publishedAt = d.PublicationStartDate;
        validThrough = d.ApplicationCloseDate;
        remote = d.PositionLocation?.some((l: any) => /remote|anywhere/i.test(l.LocationName));
        const r = d.PositionRemuneration?.[0];
        if (r) {
          salaryMin = Number(r.MinimumRange) || undefined;
          salaryMax = Number(r.MaximumRange) || undefined;
          salaryCurrency = 'USD';
          salaryPeriod = /annum|year/i.test(r.Description) ? 'year' : r.RateIntervalCode || '';
        }
        employmentType = d.PositionSchedule?.[0]?.Name;
        attribution = { name: 'USAJOBS', url: d.PositionURI };
      }
      break;
    case 'jooble':
      url = x.link;
      title = x.title;
      company = x.company;
      location = x.location;
      description = x.snippet;
      publishedAt = x.updated;
      employmentType = x.type;
      attribution = { name: 'Jooble', url: x.link };
      break;
  }
  if (!url || !title) return;
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return;
  } catch {
    return;
  }
  const j: Job = {
    id: store.id(),
    url,
    canonicalKey: canonical(url),
    title: String(title),
    company: String(company || s.label || s.board),
    location: String(location || ''),
    description: text(description),
    ats: detectATS(url),
    source: s.id,
    score: 0,
    reasons: [],
    createdAt: store.now(),
    status: 'open',
    practice: false,
    externalId,
    remote: !!remote || /\bremote\b/i.test(String(location)),
    employmentType: jobType(employmentType),
    seniority: level(String(title)),
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryPeriod,
    publishedAt: iso(publishedAt),
    validThrough: iso(validThrough),
    lastSeenAt: store.now(),
    lastCheckedAt: store.now(),
    freshness: 'listed',
    observations: [{ sourceId: s.id, active: true, lastSeenAt: store.now() }],
    attribution,
  };
  if (j.validThrough && Date.parse(j.validThrough) < Date.now()) j.status = 'closed';
  Object.assign(j, rank(j, store.profile(), store.settings()));
  return j;
}
export function reconcileSnapshot(s: WatchSource, incoming: Job[], complete: boolean) {
  const keys = new Set(incoming.map((j) => j.canonicalKey));
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (const j of incoming) store.putJob(j);
    if (complete) {
      for (const old of store.jobs()) {
        const observation = old.observations?.find((o) => o.sourceId === s.id);
        const belongs = !!observation || old.source === s.id;
        if (!belongs || keys.has(old.canonicalKey)) continue;
        const observations = (
          old.observations || [
            { sourceId: s.id, active: true, lastSeenAt: old.lastSeenAt || old.createdAt },
          ]
        ).map((o) => (o.sourceId === s.id ? { ...o, active: false } : o));
        store.putJob({
          ...old,
          observations,
          status: observations.some((o) => o.active)
            ? 'open'
            : ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable'].includes(s.ats)
              ? 'closed'
              : 'stale',
          lastCheckedAt: store.now(),
        });
      }
    }
    store.db.exec('COMMIT');
  } catch (e) {
    store.db.exec('ROLLBACK');
    throw e;
  }
}
const locks = new Set<string>();
export async function syncOne(s: WatchSource) {
  if (locks.has(s.id)) throw new Error('This source is already syncing');
  if (s.nextSync && Date.parse(s.nextSync) > Date.now()) return s.count || 0;
  locks.add(s.id);
  const c = catalog.find((c) => c.kind === s.ats)!;
  s.lastAttempt = store.now();
  const interval = Math.max(c.minIntervalMinutes, store.settings().pollMinutes);
  s.nextSync = new Date(Date.now() + interval * 60000).toISOString();
  store.saveSource(s);
  try {
    const b = encodeURIComponent(s.board || '');
    let raw: any,
      list: any[] = [],
      complete = true;
    const read = async (url: string, options?: Parameters<typeof publicFetch>[2]) =>
      JSON.parse((await publicFetch(url, 25_000_000, options)).text);
    switch (s.ats) {
      case 'greenhouse':
        raw = await read(`https://boards-api.greenhouse.io/v1/boards/${b}/jobs?content=true`);
        if (!Array.isArray(raw.jobs)) throw new Error('Unexpected Greenhouse response');
        list = raw.jobs;
        break;
      case 'lever':
        raw = await read(
          `https://api${s.region === 'eu' ? '.eu' : ''}.lever.co/v0/postings/${b}?mode=json`,
        );
        if (!Array.isArray(raw)) throw new Error('Unexpected Lever response');
        list = raw;
        break;
      case 'ashby':
        raw = await read(
          `https://api.ashbyhq.com/posting-api/job-board/${b}?includeCompensation=true`,
        );
        if (!Array.isArray(raw.jobs)) throw new Error('Unexpected Ashby response');
        list = raw.jobs;
        break;
      case 'workable':
        raw = await read(`https://www.workable.com/api/accounts/${b}?details=true`);
        if (!Array.isArray(raw.jobs)) throw new Error('Unexpected Workable response');
        list = raw.jobs;
        if (!s.label && raw.name) s.label = raw.name;
        break;
      case 'smartrecruiters':
        for (let page = 0; page < 10; page++) {
          raw = await read(
            `https://api.smartrecruiters.com/v1/companies/${b}/postings?limit=100&offset=${page * 100}`,
          );
          if (!Array.isArray(raw.content)) throw new Error('Unexpected SmartRecruiters response');
          for (let i = 0; i < raw.content.length; i += 4) {
            const batch = raw.content.slice(i, i + 4);
            const results = await Promise.allSettled(
              batch.map((x: any) =>
                read(
                  `https://api.smartrecruiters.com/v1/companies/${b}/postings/${encodeURIComponent(x.id)}`,
                ),
              ),
            );
            for (const [index, result] of results.entries()) {
              if (result.status === 'fulfilled') list.push(result.value);
              else {
                list.push(batch[index]);
                complete = false;
              }
            }
          }
          if (list.length >= Number(raw.totalFound) || raw.content.length < 100) break;
          if (page === 9) complete = false;
        }
        break;
      case 'remotive':
        raw = await read('https://remotive.com/api/remote-jobs');
        if (!Array.isArray(raw.jobs)) throw new Error('Unexpected Remotive response');
        list = raw.jobs;
        complete = true;
        break;
      case 'remoteok':
        raw = await read('https://remoteok.com/api');
        if (!Array.isArray(raw)) throw new Error('Unexpected Remote OK response');
        list = raw.filter((x: any) => x.id);
        complete = true;
        break;
      case 'arbeitnow':
        for (let page = 1; page <= 10; page++) {
          raw = await read(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
          if (!Array.isArray(raw.data)) throw new Error('Unexpected Arbeitnow response');
          list.push(...raw.data);
          if (!raw.links?.next) break;
          if (page === 10) complete = false;
        }
        break;
      case 'adzuna':
      case 'usajobs':
      case 'jooble':
        {
          const roles = store
            .settings()
            .roles.split(/[,\n]/)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 3);
          if (!roles.length) roles.push(store.profile().headline || 'software');
          const locations = store
            .settings()
            .locations.split(/[,\n]/)
            .map((x) => x.trim())
            .filter((x) => x && x.toLowerCase() !== 'remote')
            .slice(0, 2);
          if (!locations.length) locations.push('');
          if (s.ats === 'adzuna' && (!secret('adzunaAppId') || !secret('adzunaApiKey')))
            throw new Error('Add your Adzuna app ID and API key in Integrations');
          if (s.ats === 'usajobs' && (!secret('usajobsApiKey') || !secret('usajobsEmail')))
            throw new Error('Add your USAJOBS API key and registration email');
          if (s.ats === 'jooble' && !secret('joobleApiKey'))
            throw new Error('Add your Jooble API key');
          for (const role of roles)
            for (const location of locations)
              for (let page = 1; page <= (s.ats === 'jooble' ? 1 : 2); page++) {
                let rows: any[] = [];
                if (s.ats === 'adzuna') {
                  const maxAgeDays = store.settings().maxAgeDays ?? 30;
                  const qs = new URLSearchParams({
                    app_id: secret('adzunaAppId'),
                    app_key: secret('adzunaApiKey'),
                    'content-type': 'application/json',
                    what: role,
                    where: location,
                    sort_by: 'date',
                    results_per_page: '50',
                  });
                  if (maxAgeDays > 0)
                    qs.set('max_days_old', String(Math.min(60, maxAgeDays)));
                  raw = await read(
                    `https://api.adzuna.com/v1/api/jobs/${b || 'us'}/search/${page}?${qs}`,
                  );
                  rows = raw.results;
                } else if (s.ats === 'usajobs') {
                  const maxAgeDays = store.settings().maxAgeDays ?? 30;
                  const qs = new URLSearchParams({
                    Keyword: role,
                    LocationName: location,
                    ResultsPerPage: '100',
                    Page: String(page),
                    SortField: 'opendate',
                    SortDirection: 'Desc',
                  });
                  if (maxAgeDays > 0) qs.set('DatePosted', String(Math.min(60, maxAgeDays)));
                  raw = await read(`https://data.usajobs.gov/api/Search?${qs}`, {
                    headers: {
                      'Authorization-Key': secret('usajobsApiKey'),
                      'User-Agent': secret('usajobsEmail'),
                    },
                  });
                  rows = raw.SearchResult?.SearchResultItems;
                } else {
                  const host = s.board ? `${s.board}.jooble.org` : 'jooble.org';
                  raw = await read(
                    `https://${host}/api/${encodeURIComponent(secret('joobleApiKey'))}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keywords: role, location, page }),
                    },
                  );
                  rows = raw.jobs;
                }
                if (!Array.isArray(rows)) throw new Error('Unexpected ' + s.ats + ' response');
                list.push(...rows);
                if (rows.length < (s.ats === 'usajobs' ? 100 : 50)) break;
              }
          const seen = new Set<string>();
          list = list.filter((x) => {
            const key = String(x.id || x.MatchedObjectId || x.link);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          complete = false;
        }
        break;
    }
    const normalized = list.map((x) => fromSource(s, x)).filter((j): j is Job => !!j);
    if (list.some((x) => x.active !== false && x.isListed !== false) && normalized.length === 0)
      throw new Error('No valid job records found; previous jobs were preserved');
    reconcileSnapshot(s, normalized, complete);
    s.lastSync = store.now();
    s.lastError = '';
    s.count = normalized.length;
    s.completeSnapshot = complete;
    store.event(`Checked ${s.label || c.name}: ${normalized.length} current listings`);
    return normalized.length;
  } catch (e) {
    s.lastError = redact((e as Error).message);
    s.nextSync = new Date(Date.now() + Math.max(c.minIntervalMinutes, 60) * 60000).toISOString();
    throw new Error(s.lastError);
  } finally {
    locks.delete(s.id);
    store.saveSource(s);
  }
}
export function freshness(j: Job): Job['status'] {
  if (j.validThrough && Date.parse(j.validThrough) < Date.now()) return 'closed';
  if (j.status === 'closed') return 'closed';
  if (Date.now() - Date.parse(j.lastSeenAt || j.createdAt) > 7 * 86400000) return 'stale';
  return j.status;
}
export function matches(j: Job, s: Settings) {
  if (j.practice || freshness(j) !== 'open') return false;
  const parts = (v: string) =>
    v
      .toLowerCase()
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  if (parts(s.excludedCompanies).some((x) => includesTerm(j.company, x))) return false;
  const roles = parts(s.roles);
  if (roles.length && !roles.some((x) => includesTerm(j.title, x))) return false;
  const locations = parts(s.locations);
  if (
    locations.length &&
    !locations.some(
      (x) =>
        includesTerm(j.location + ' ' + j.description, x) ||
        (x === 'remote' && j.remote),
    )
  )
    return false;
  if (s.remoteOnly && !j.remote) return false;
  if (
    s.employmentTypes?.length &&
    (!j.employmentType || !s.employmentTypes.includes(j.employmentType))
  )
    return false;
  if (s.seniority?.length && (!j.seniority || !s.seniority.includes(j.seniority))) return false;
  if (
    s.maxAgeDays &&
    j.publishedAt &&
    Date.now() - Date.parse(j.publishedAt) > s.maxAgeDays * 86400000
  )
    return false;
  if (s.requireSalary && !j.salaryMin && !j.salaryMax) return false;
  if (
    s.minSalary &&
    (j.salaryMin || j.salaryMax) &&
    j.salaryCurrency === s.currency &&
    /year|annual|annum/i.test(j.salaryPeriod || '') &&
    Math.max(j.salaryMin || 0, j.salaryMax || 0) < s.minSalary
  )
    return false;
  if (
    s.minSalary &&
    s.requireSalary &&
    (!j.salaryCurrency ||
      j.salaryCurrency !== s.currency ||
      !/year|annual|annum/i.test(j.salaryPeriod || ''))
  )
    return false;
  return true;
}
export function queryJobs(query: {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  matching?: boolean;
  status?: string;
  ats?: string;
  remoteOnly?: boolean;
}) {
  const settings = store.settings();
  let list = store.jobs().map((j) => ({ ...j, status: freshness(j) }));
  if (query.matching !== false) list = list.filter((j) => matches(j, settings));
  else
    list = list.filter(
      (j) => !j.practice && (query.status === 'all' || j.status === (query.status || 'open')),
    );
  if (query.q)
    list = list.filter((j) =>
      (j.title + ' ' + j.company + ' ' + j.location + ' ' + j.description)
        .toLowerCase()
        .includes(query.q!.toLowerCase()),
    );
  if (query.ats) list = list.filter((j) => j.ats === query.ats);
  if (query.remoteOnly) list = list.filter((j) => j.remote);
  list.sort(
    query.sort === 'newest'
      ? (a, b) =>
          Date.parse(b.publishedAt || b.createdAt) - Date.parse(a.publishedAt || a.createdAt)
      : (a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const page = Math.max(1, query.page || 1),
    limit = Math.min(100, Math.max(1, query.limit || 24));
  return {
    jobs: list.slice((page - 1) * limit, page * limit),
    total: list.length,
    page,
    pages: Math.ceil(list.length / limit),
    coverage: store
      .sources()
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        name: s.label || s.ats,
        lastSync: s.lastSync,
        error: s.lastError,
        nextSync: s.nextSync,
        count: s.count,
        complete: s.completeSnapshot,
      })),
  };
}
export function discoveryRun(): DiscoveryRun {
  return store.getKV('discovery', {
    id: '',
    status: 'idle',
    startedAt: '',
    processed: 0,
    total: 0,
    added: 0,
    results: [],
  });
}
export async function runDiscovery() {
  if (discoveryRun().status === 'running') return discoveryRun();
  const sources = store.sources().filter((s) => s.enabled);
  const run: DiscoveryRun = {
    id: store.id(),
    status: 'running',
    startedAt: store.now(),
    processed: 0,
    total: sources.length,
    added: 0,
    results: [],
  };
  store.setKV('discovery', run);
  void (async () => {
    for (const source of sources) {
      if (store.settings().paused) break;
      const cached = !!source.nextSync && Date.parse(source.nextSync) > Date.now();
      try {
        const beforeCount = store.jobs().length;
        const count = await syncOne(source);
        run.added += Math.max(0, store.jobs().length - beforeCount);
        run.results.push({ source: source.label || source.ats, count, error: '', cached });
      } catch (e) {
        run.results.push({
          source: source.label || source.ats,
          count: 0,
          error: redact((e as Error).message),
          cached: false,
        });
      }
      run.processed++;
      store.setKV('discovery', run);
    }
    run.status = 'completed';
    run.finishedAt = store.now();
    store.setKV('discovery', run);
  })();
  return run;
}
export function parseBoard(input: string): Partial<WatchSource> {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error('Paste a career-page URL');
  }
  const segments = u.pathname.split('/').filter(Boolean);
  const ats = detectATS(u.href);
  if (['greenhouse', 'lever', 'ashby', 'smartrecruiters'].includes(ats) && segments[0])
    return {
      ats: ats as WatchSource['ats'],
      board: segments[0],
      region: u.hostname.includes('.eu.') ? 'eu' : 'global',
      url: u.href,
    };
  if (u.hostname === 'apply.workable.com') {
    if (!segments[0] || segments[0] === 'j')
      throw new Error(
        'Paste the company career page, such as https://apply.workable.com/careers, rather than a job short link',
      );
    return { ats: 'workable', board: segments[0], url: u.href };
  }
  if (u.hostname.endsWith('.workable.com'))
    return { ats: 'workable', board: u.hostname.split('.')[0], url: u.href };
  throw new Error('Choose the platform and board identifier for this career page');
}
export async function checkActive(j: Job) {
  if (j.practice) return j;
  if (j.validThrough && Date.parse(j.validThrough) < Date.now())
    return store.putJob({ ...j, status: 'closed', lastCheckedAt: store.now() });
  try {
    const r = await publicFetch(j.url);
    const $ = cheerio.load(r.text);
    let declaredExpiry = false,
      hasJobMetadata = false;
    $('script[type=\"application/ld+json\"]').each((_, el) => {
      try {
        const scan = (value: any) => {
          if (Array.isArray(value)) value.forEach(scan);
          else if (value && typeof value === 'object') {
            const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
            if (types.includes('JobPosting')) {
              hasJobMetadata = true;
              if (value.validThrough && Date.parse(value.validThrough) < Date.now())
                declaredExpiry = true;
            }
            if (value['@graph']) scan(value['@graph']);
          }
        };
        scan(JSON.parse($(el).text()));
      } catch {}
    });
    $('script,style,nav,footer').remove();
    const body = $('main').text() || $('body').text();
    const closed =
      /^(?:this (?:job|position|role|posting) (?:is |has been )?(?:no longer available|closed|filled)|job not found|position has been filled)/im.test(
        body.trim(),
      ) ||
      /(?:this job is no longer available|this position has been filled|job posting has expired|this job has expired)/i.test(
        body,
      );
    return store.putJob({
      ...j,
      status:
        closed || declaredExpiry
          ? 'closed'
          : j.status === 'closed' && !hasJobMetadata
            ? 'closed'
            : 'open',
      lastCheckedAt: store.now(),
      freshness: closed || declaredExpiry || !hasJobMetadata ? 'unknown' : 'verified',
    });
  } catch (e) {
    if (/HTTP (404|410)\b/.test((e as Error).message))
      return store.putJob({ ...j, status: 'closed', lastCheckedAt: store.now() });
    return store.putJob({ ...j, lastCheckedAt: store.now(), freshness: 'unknown' });
  }
}

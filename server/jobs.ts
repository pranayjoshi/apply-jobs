import * as cheerio from 'cheerio';
import type { Job, Settings, Profile, WatchSource } from '../src/types.ts';
import { publicFetch } from './network.ts';
import { id, now, putJob, saveSource, event, profile, settings } from './store.ts';
export function includesTerm(text: string, term: string) {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(
    text.toLowerCase(),
  );
}
export function detectATS(url: string) {
  const h = new URL(url).hostname;
  if (
    h === 'boards.greenhouse.io' ||
    h === 'job-boards.greenhouse.io' ||
    h.endsWith('.greenhouse.io')
  )
    return 'greenhouse';
  if (h === 'jobs.lever.co' || h === 'jobs.eu.lever.co') return 'lever';
  if (h === 'jobs.ashbyhq.com') return 'ashby';
  if (h === 'jobs.smartrecruiters.com' || h === 'careers.smartrecruiters.com')
    return 'smartrecruiters';
  if (h === 'apply.workable.com' || h.endsWith('.workable.com')) return 'workable';
  if (h === 'www.linkedin.com' || h === 'linkedin.com') return 'linkedin';
  if (h === 'indeed.com' || h.endsWith('.indeed.com')) return 'indeed';
  if (h === 'www.ziprecruiter.com') return 'ziprecruiter';
  if (h.endsWith('.myworkdayjobs.com')) return 'workday';
  return 'custom';
}
export function canonical(url: string) {
  const u = new URL(url);
  u.hash = '';
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|source$|ref$|referrer$|gh_src$)/i.test(key)) u.searchParams.delete(key);
  u.pathname = u.pathname.replace(/\/+$/, '');
  // Posting and application URLs identify the same opportunity on these ATSes.
  const ats = detectATS(u.href);
  if (ats === 'lever' && /^\/[^/]+\/[^/]+\/apply$/.test(u.pathname))
    u.pathname = u.pathname.replace(/\/apply$/, '');
  if (ats === 'ashby' && /^\/[^/]+\/[^/]+\/application$/.test(u.pathname))
    u.pathname = u.pathname.replace(/\/application$/, '');
  if (ats === 'workable' && /^\/j\/[^/]+\/apply$/.test(u.pathname))
    u.pathname = u.pathname.replace(/\/apply$/, '');
  if (u.hostname === 'boards.greenhouse.io') u.hostname = 'job-boards.greenhouse.io';
  u.searchParams.sort();
  return u.href;
}
export function rank(
  j: Pick<Job, 'title' | 'description' | 'company' | 'location'>,
  p: Profile,
  s: Settings,
) {
  const tokens = p.skills
    .toLowerCase()
    .split(/[,\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const text = (j.title + ' ' + j.description).toLowerCase();
  const matches = tokens.filter((t) => includesTerm(text, t));
  const roles = s.roles
    .toLowerCase()
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const locations = s.locations
    .toLowerCase()
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const excluded = s.excludedCompanies
    .toLowerCase()
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const reasons: string[] = [];
  let score = tokens.length ? Math.round(35 + (45 * matches.length) / tokens.length) : 40;
  if (matches.length) reasons.push(`Matches ${matches.slice(0, 4).join(', ')}`);
  if (roles.length) {
    if (roles.some((r) => includesTerm(j.title, r))) {
      score += 15;
      reasons.push('Matches your target role');
    } else {
      score -= 25;
      reasons.push('Outside your target roles');
    }
  }
  if (locations.length) {
    if (locations.some((l) => includesTerm(j.location + ' ' + j.description, l))) {
      score += 10;
      reasons.push('Matches a preferred location');
    } else {
      score -= 15;
      reasons.push('Preferred location not found');
    }
  }
  if (excluded.some((c) => includesTerm(j.company, c))) {
    score = 0;
    reasons.push('Excluded employer');
  }
  if (!tokens.length) reasons.push('Add skills to personalize this match');
  return { score: Math.min(99, Math.max(0, score)), reasons };
}
export async function importURL(url: string, overrides: Partial<Job> = {}) {
  const response = await publicFetch(url);
  const $ = cheerio.load(response.text);
  let data: any = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const v = JSON.parse($(el).text());
      const scan = (a: any) => {
        if (Array.isArray(a)) a.forEach(scan);
        else if (a && typeof a === 'object') {
          if (a['@type'] === 'JobPosting' || a['@type']?.includes?.('JobPosting')) data = a;
          if (a['@graph']) scan(a['@graph']);
        }
      };
      scan(v);
    } catch {}
  });
  $('script,style,nav,footer,header,noscript').remove();
  const desc = cheerio.load(data.description || '').text() || $('main').text() || $('body').text();
  const j: Job = {
    id: id(),
    url: response.url,
    canonicalKey: canonical(response.url),
    title:
      data.title ||
      $('h1').first().text().trim() ||
      $('title').text().split('|')[0].trim() ||
      'Untitled role',
    company:
      data.hiringOrganization?.name ||
      $('meta[property="og:site_name"]').attr('content') ||
      new URL(url).hostname,
    location:
      data.jobLocationType === 'TELECOMMUTE'
        ? 'Remote'
        : data.jobLocation?.address?.addressLocality || '',
    description: desc.replace(/\s+/g, ' ').trim().slice(0, 30000),
    ats: detectATS(response.url),
    source: 'Pasted URL',
    score: 0,
    reasons: [],
    createdAt: now(),
    status: 'open',
    practice: false,
    ...overrides,
  };
  Object.assign(j, rank(j, profile(), settings()));
  return putJob(j);
}
export async function syncSource(source: WatchSource) {
  return (await import('./discovery.ts')).syncOne(source);
}

export function eligible(j: Job, s: Settings) {
  if (
    j.practice ||
    j.status !== 'open' ||
    j.score < s.minScore ||
    !['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable'].includes(j.ats)
  )
    return false;
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
    !locations.some((x) => includesTerm(j.location + ' ' + j.description, x))
  )
    return false;
  return true;
}

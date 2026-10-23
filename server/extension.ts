import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { secret, setSecrets } from './secrets.ts';
import { getKV, setKV, id, now, putJob, profile, settings } from './store.ts';
import { publicURL } from './network.ts';
import { canonical, detectATS, rank } from './jobs.ts';
import type { Job } from '../src/types.ts';
const digest = (v: string) => createHash('sha256').update(v).digest();
export const extensionOrigin = (origin: string) => /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
export function makePairCode() {
  const code = String(randomBytes(4).readUInt32BE() % 1000000).padStart(6, '0');
  setKV('extensionPair', {
    hash: digest(code).toString('hex'),
    expiresAt: Date.now() + 300000,
    attempts: 0,
  });
  return { code, expiresAt: new Date(Date.now() + 300000).toISOString() };
}
export function pairExtension(origin: string, code: string) {
  if (!extensionOrigin(origin)) throw new Error('Use the Apply Jobs extension');
  const pair = getKV('extensionPair', { hash: '', expiresAt: 0, attempts: 0 });
  if (pair.expiresAt < Date.now() || pair.attempts >= 5 || !pair.hash)
    throw new Error('Generate a new pairing code in Integrations');
  pair.attempts++;
  setKV('extensionPair', pair);
  if (!timingSafeEqual(digest(code), Buffer.from(pair.hash, 'hex')))
    throw new Error('Incorrect pairing code');
  const token = randomBytes(32).toString('hex');
  setSecrets({ ['extension:' + origin]: token });
  setKV('extensionPair', { hash: '', expiresAt: 0, attempts: 0 });
  return { token };
}
export function authorizedExtension(origin: string, auth: string) {
  if (!extensionOrigin(origin)) return false;
  const saved = secret('extension:' + origin);
  if (!saved || !auth.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(saved), digest(auth.slice(7)));
}
export async function captureJob(input: {
  url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl?: string;
}) {
  await publicURL(input.url);
  let applyURL = input.url;
  if (input.applyUrl) {
    await publicURL(input.applyUrl);
    applyURL = input.applyUrl;
  }
  const j: Job = {
    id: id(),
    url: applyURL,
    canonicalKey: canonical(applyURL),
    title: input.title,
    company: input.company || new URL(input.url).hostname,
    location: input.location,
    description: input.description.slice(0, 30000),
    ats: detectATS(applyURL),
    source: 'Browser capture',
    score: 0,
    reasons: [],
    createdAt: now(),
    lastSeenAt: now(),
    lastCheckedAt: now(),
    status: 'open',
    freshness: 'unknown',
    practice: false,
    attribution: { name: 'Original posting', url: input.url },
  };
  Object.assign(j, rank(j, profile(), settings()));
  return putJob(j);
}

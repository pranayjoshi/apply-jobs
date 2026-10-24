import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Profile, Settings, Job, Application, WatchSource, Activity } from '../src/types.ts';
export const dataDir = path.resolve(process.env.APPLY_JOBS_DATA || '.apply-jobs');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
chmodSync(dataDir, 0o700);
for (const d of ['documents', 'receipts', 'browser'])
  mkdirSync(path.join(dataDir, d), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(path.join(dataDir, 'apply-jobs.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,canonical_key TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,job_id TEXT UNIQUE NOT NULL REFERENCES jobs(id),stage TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,application_id TEXT,message TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
PRAGMA user_version=1;`);
export const blankProfile: Profile = {
  resumeMode: 'original',
  name: '',
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
  skills: '',
  workAuthorization: '',
  sponsorship: '',
  resumeText: '',
  resumeFile: '',
  confirmed: false,
  version: 0,
  answers: [],
};
export const defaultSettings: Settings = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: '',
  temperature: 0.2,
  autopilot: false,
  paused: false,
  minScore: 65,
  roles: '',
  locations: '',
  excludedCompanies: '',
  pollMinutes: 2,
  headless: false,
  browser: 'system',
  remoteOnly: false,
  employmentTypes: [],
  seniority: [],
  minSalary: 0,
  currency: 'USD',
  requireSalary: false,
  maxAgeDays: 30,
  onboardingComplete: false,
};
export function getKV<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM kv WHERE key=?').get(key) as
    { value: string } | undefined;
  return row ? JSON.parse(row.value) : structuredClone(fallback);
}
export function setKV(key: string, value: unknown) {
  db.prepare(
    'INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, JSON.stringify(value));
}
export const profile = () => getKV('profile', blankProfile);
export const settings = () => ({ ...defaultSettings, ...getKV('settings', defaultSettings) });
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function jobs(): Job[] {
  return (db.prepare('SELECT data FROM jobs ORDER BY rowid DESC').all() as { data: string }[]).map(
    (r) => JSON.parse(r.data),
  );
}
export function job(id: string): Job | undefined {
  const r = db.prepare('SELECT data FROM jobs WHERE id=?').get(id) as { data: string } | undefined;
  return r && JSON.parse(r.data);
}
export function putJob(j: Job): Job {
  const existing = db
    .prepare('SELECT id,data FROM jobs WHERE canonical_key=?')
    .get(j.canonicalKey) as { id: string; data: string } | undefined;
  if (existing) {
    const old = JSON.parse(existing.data);
    const observations = [...(old.observations || [])];
    for (const observation of j.observations || []) {
      const index = observations.findIndex((x: any) => x.sourceId === observation.sourceId);
      if (index < 0) observations.push(observation);
      else observations[index] = observation;
    }
    j = {
      ...old,
      ...Object.fromEntries(Object.entries(j).filter(([, value]) => value !== undefined)),
      observations,
      id: old.id,
      createdAt: old.createdAt,
    } as Job;
  }
  db.prepare(
    'INSERT INTO jobs(id,canonical_key,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
  ).run(j.id, j.canonicalKey, JSON.stringify(j));
  return j;
}
export function applications(): Application[] {
  const rows = db
    .prepare(
      `SELECT applications.data AS applicationData, jobs.data AS jobData
       FROM applications JOIN jobs ON jobs.id=applications.job_id
       ORDER BY applications.rowid DESC`,
    )
    .all() as { applicationData: string; jobData: string }[];
  return rows.map(({ applicationData, jobData }) => ({
    ...(JSON.parse(applicationData) as Application),
    job: JSON.parse(jobData) as Job,
  }));
}
export function application(aid: string): Application | undefined {
  const row = db.prepare('SELECT data FROM applications WHERE id=?').get(aid) as
    { data: string } | undefined;
  if (!row) return undefined;
  const application = JSON.parse(row.data) as Application;
  return { ...application, job: job(application.jobId)! };
}
export function saveApplication(a: Application) {
  a.updatedAt = now();
  db.prepare(
    'INSERT INTO applications(id,job_id,stage,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage,data=excluded.data',
  ).run(a.id, a.jobId, a.stage, JSON.stringify(a));
}
export function event(message: string, kind = 'info', aid: string | null = null) {
  db.prepare('INSERT INTO events(application_id,message,kind,created_at) VALUES(?,?,?,?)').run(
    aid,
    message,
    kind,
    now(),
  );
}
export function activity(): Activity[] {
  return db
    .prepare(
      'SELECT id,application_id as applicationId,message,kind,created_at as createdAt FROM events ORDER BY id DESC LIMIT 80',
    )
    .all() as unknown as Activity[];
}
export const sources = (): WatchSource[] =>
  (db.prepare('SELECT data FROM sources').all() as { data: string }[]).map((r) =>
    JSON.parse(r.data),
  );
export function saveSource(s: WatchSource) {
  db.prepare(
    'INSERT INTO sources(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
  ).run(s.id, JSON.stringify(s));
}
export function deleteSource(sid: string) {
  db.prepare('DELETE FROM sources WHERE id=?').run(sid);
}
export function update(aid: string, patch: Partial<Application>) {
  const a = application(aid);
  if (!a) throw new Error('Application not found');
  if (patch.message && patch.message !== a.message) {
    a.progress = [
      ...(a.progress || []),
      { message: patch.message, stage: patch.stage || a.stage, at: now() },
    ].slice(-40);
  }
  if (patch.stage) a.waitingFor = undefined;
  Object.assign(a, patch);
  saveApplication(a);
  return a;
}
export function recover() {
  for (const a of applications()) {
    if (a.stage === 'submitting') {
      update(a.id, {
        stage: 'unknown',
        message:
          'The app restarted during submission. Check the employer confirmation before retrying.',
      });
      event('Submission outcome needs reconciliation', 'warning', a.id);
    } else if (['preparing', 'filling', 'review'].includes(a.stage)) {
      update(a.id, {
        stage: 'needs_user',
        message: 'Browser session ended. Resume to reopen and validate the form.',
      });
    }
  }
}

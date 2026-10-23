import Fastify from 'fastify';
import {
  extensionOrigin,
  authorizedExtension,
  makePairCode,
  pairExtension,
  captureJob,
} from './extension.ts';
import { registerUpgradeRoutes } from './upgrade-routes.ts';
import { catalog, queryJobs, discoveryRun, checkActive, matches } from './discovery.ts';
import { secretStatus, setSecrets, redact } from './secrets.ts';
import { inboxState } from './inbox.ts';
import { startLocalModel, stopLocalModel } from './local-model.ts';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.ts';
import { importURL, rank, syncSource, eligible } from './jobs.ts';
import { modelStatus, preparePacket, extractResume } from './llm.ts';
import {
  renderPDF,
  textFromPDF,
  ocrPDF,
  ocrImage,
  escapeHTML,
  hash,
  saveReceipt,
} from './documents.ts';
import {
  enqueueTick,
  exclusiveProcess,
  submitApplication,
  applyAnswers,
  withApplicationLock,
  closeSession,
  shutdownBrowsers,
  hasSession,
} from './worker.ts';
import type { Application, Job, WatchSource } from '../src/types.ts';
const app = Fastify({ logger: false, bodyLimit: 1_000_000 });
await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const port = Number(process.env.PORT || 4318);
app.addHook('onRequest', async (req, reply) => {
  const host = req.headers.host?.split(':')[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host || ''))
    return reply.code(403).send({ error: 'Local access only' });
  const origin = req.headers.origin || '';
  const extensionRequest = req.url.startsWith('/api/extension/') && extensionOrigin(origin);
  if (extensionRequest) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Apply-Jobs, Authorization');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    if (
      req.url !== '/api/extension/pair' &&
      !authorizedExtension(origin, req.headers.authorization || '')
    )
      return reply.code(403).send({ error: 'Pair your extension in Integrations first' });
  }
  if (
    req.url.startsWith('/api/') &&
    !extensionRequest &&
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  ) {
    if (req.headers['x-apply-jobs'] !== 'local')
      return reply.code(403).send({ error: 'Missing local application header' });
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        'http://127.0.0.1:4317',
        `http://127.0.0.1:${port}`,
        'http://localhost:4317',
        `http://localhost:${port}`,
      ].includes(origin)
    )
      return reply.code(403).send({ error: 'Untrusted origin' });
  }
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
});
app.setErrorHandler((error, req, reply) => {
  const e = error as Error;
  const validation = e instanceof z.ZodError;
  reply.code(validation ? 400 : (error as any).statusCode || 400).send({
    error: validation
      ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : redact(e.message),
  });
});
let models = { connected: false, models: [] as string[], error: 'Not checked yet' };
const refreshModels = async () => (models = await modelStatus());
const pid = z.string().uuid();
const getApp = (req: any) => {
  const a = store.application(pid.parse(req.params.id));
  if (!a) throw new Error('Application not found');
  return a;
};
app.get('/api/state', () => ({
  profile: store.profile(),
  settings: store.settings(),
  jobs: queryJobs({ matching: false, limit: 100, sort: 'fit' }).jobs,
  jobTotal: store.jobs().filter((j) => !j.practice).length,
  discovery: discoveryRun(),
  onboarding: store.getKV('onboarding', { dismissed: false, completed: false }),
  integrations: secretStatus(),
  inbox: inboxState().messages,
  applications: store.applications().map((a) => ({ ...a, hasSession: hasSession(a.id) })),
  sources: store.sources(),
  activity: store.activity(),
  modelStatus: models,
}));
app.options('/api/extension/*', async (_, reply) => reply.code(204).send());
app.post('/api/extension/pair-code', makePairCode);
app.post('/api/extension/pair', async (req) =>
  pairExtension(
    req.headers.origin || '',
    z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body).code,
  ),
);
app.post('/api/extension/capture', async (req) =>
  captureJob(
    z
      .object({
        url: z.url(),
        title: z.string().min(1).max(500),
        company: z.string().max(300),
        location: z.string().max(500),
        description: z.string().max(30000),
        applyUrl: z.url().optional(),
      })
      .parse(req.body),
  ),
);
app.post('/api/extension/revoke', async () => {
  setSecrets(
    Object.fromEntries(
      Object.keys(secretStatus())
        .filter((k) => k.startsWith('extension:'))
        .map((k) => [k, '__DELETE__']),
    ),
  );
  return { ok: true };
});
app.get('/api/health', () => ({ name: 'Apply Jobs', status: 'ok', version: '0.2.0' }));
const str = z.string().max(30000);
const profileSchema = z.object({
  employmentHistory: z
    .array(z.object({ company: str, title: str, start: str, end: str, description: str }))
    .max(20)
    .optional(),
  educationHistory: z
    .array(z.object({ school: str, degree: str, field: str, start: str, end: str }))
    .max(20)
    .optional(),
  name: str,
  email: z.union([z.email(), z.literal('')]),
  phone: str,
  location: str,
  headline: str,
  linkedin: str,
  website: str,
  summary: str,
  experience: str,
  education: str,
  skills: str,
  workAuthorization: str,
  sponsorship: str,
  resumeText: str,
  resumeFile: str,
  confirmed: z.boolean(),
  version: z.number().optional(),
  answers: z
    .array(z.object({ question: z.string().max(400), answer: z.string().max(10000) }))
    .max(300),
});
app.put('/api/profile', async (req) => {
  const p = profileSchema.parse(req.body);
  if (p.confirmed && (!p.name.trim() || !p.email.trim()))
    throw new Error('Name and email are required to confirm your profile');
  const updated = {
    ...p,
    resumeFile: store.profile().resumeFile,
    version: store.profile().version + 1,
  };
  store.setKV('profile', updated);
  for (const j of store.jobs()) store.putJob({ ...j, ...rank(j, updated, store.settings()) });
  store.event('Candidate profile updated');
  return updated;
});
app.post('/api/profile/import', async (req) => {
  const part = await req.file();
  if (!part) throw new Error('Choose a PDF or text résumé');
  const b = await part.toBuffer();
  let text = '';
  let ext = '';
  if (part.mimetype === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf')) {
    if (!b.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid PDF file');
    text = await textFromPDF(b);
    if (text.trim().length < 40) {
      store.event('Reading scanned résumé with local OCR (up to 4 pages)');
      text = await ocrPDF(b);
    }
    ext = 'pdf';
  } else if (part.filename.toLowerCase().endsWith('.docx')) {
    const mammoth = await import('mammoth');
    text = (await mammoth.extractRawText({ buffer: b })).value;
    ext = 'docx';
  } else if (/\.(png|jpe?g)$/i.test(part.filename)) {
    text = await ocrImage(b);
    ext = part.filename.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  } else if (part.filename.toLowerCase().endsWith('.txt')) {
    text = b.toString('utf8');
    ext = 'txt';
  } else throw new Error('Supported formats: PDF, DOCX, TXT, PNG and JPEG');
  if (!text.trim())
    throw new Error('No text found. Paste your résumé text, or upload a text-based PDF.');
  const filename = `original-${store.id()}.${ext}`;
  await writeFile(path.join(store.dataDir, 'documents', filename), b, { mode: 0o600 });
  const p = store.profile();
  p.resumeText = text.slice(0, 30000);
  p.resumeFile = filename;
  p.confirmed = false;
  p.version++;
  store.setKV('profile', p);
  store.event('Résumé imported; confirm extracted facts before applying');
  return { text: p.resumeText, profile: p };
});
app.post('/api/profile/extract', async () => {
  const p = store.profile();
  if (!p.resumeText.trim()) throw new Error('Import or paste résumé text first');
  const extracted = await extractResume(p.resumeText);
  return { ...p, ...extracted, confirmed: false };
});
const settingsSchema = z.object({
  provider: z.enum(['ollama', 'compatible']),
  baseUrl: z.url().refine((s) => {
    const u = new URL(s);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  }, 'Use an HTTP model endpoint without credentials'),
  model: z.string().max(200),
  temperature: z.number().min(0).max(1),
  autopilot: z.boolean(),
  paused: z.boolean(),
  minScore: z.number().min(0).max(100),
  roles: z.string().max(2000),
  locations: z.string().max(2000),
  excludedCompanies: z.string().max(5000),
  pollMinutes: z.number().min(5).max(1440),
  headless: z.boolean(),
  remoteOnly: z.boolean().optional(),
  employmentTypes: z.array(z.string()).max(6).optional(),
  seniority: z.array(z.string()).max(8).optional(),
  minSalary: z.number().min(0).max(5000000).optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR']).optional(),
  requireSalary: z.boolean().optional(),
  maxAgeDays: z.number().int().min(0).max(365).optional(),
  onboardingComplete: z.boolean().optional(),
});
app.put('/api/settings', async (req) => {
  const s = settingsSchema.parse(req.body);
  if (s.autopilot && !store.profile().confirmed)
    throw new Error('Confirm your candidate profile before enabling Autopilot');
  if (new URL(s.baseUrl).origin !== new URL(store.settings().baseUrl).origin)
    setSecrets({ modelApiKey: '__DELETE__' });
  store.setKV('settings', { ...store.settings(), ...s });
  for (const j of store.jobs()) store.putJob({ ...j, ...rank(j, store.profile(), s) });
  void refreshModels();
  return s;
});
app.post('/api/pause', async (req) => {
  const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
  store.setKV('settings', { ...store.settings(), paused });
  store.event(paused ? 'Automation paused' : 'Automation resumed');
  return { paused };
});
app.post('/api/models/check', refreshModels);
app.post('/api/jobs/import', async (req) => {
  const { url } = z.object({ url: z.url() }).parse(req.body);
  const j = await importURL(url);
  store.event(`Added ${j.title} at ${j.company}`);
  return j;
});
app.post('/api/jobs/manual', async (req) => {
  const d = z
    .object({
      url: z.url(),
      title: z.string().min(1).max(300),
      company: z.string().min(1).max(200),
      location: z.string().max(300),
      description: str,
    })
    .parse(req.body);
  return importURL(d.url, d);
});
app.post('/api/practice', async () => {
  const j: Job = {
    id: store.id(),
    url: `http://127.0.0.1:${port}/practice/apply`,
    canonicalKey: 'practice:apply-jobs',
    title: 'Product Engineer',
    company: 'Apply Jobs Practice',
    location: 'Remote',
    description:
      'A practice application that stays on your computer. Fill your contact details, upload a résumé, and answer one question. No information is sent to any employer.',
    ats: 'practice',
    source: 'Built-in practice',
    score: 100,
    reasons: ['Try the complete workflow safely'],
    createdAt: store.now(),
    status: 'open',
    practice: true,
  };
  return store.putJob(j);
});
app.post('/api/jobs/:id/apply', async (req: any) => {
  let j = store.job(pid.parse(req.params.id));
  if (!j) throw new Error('Job not found');
  if (!j.practice) {
    j = await checkActive(j);
    if (j.status === 'closed') throw new Error('This job has closed');
  }
  const existing = store.applications().find((a) => a.jobId === j.id);
  if (existing) return existing;
  const a: Application = {
    id: store.id(),
    jobId: j.id,
    stage: 'queued',
    message: 'Waiting in your queue',
    fields: [],
    packet: null,
    profileVersion: store.profile().version,
    revision: 0,
    snapshotHash: '',
    receipt: null,
    createdAt: store.now(),
    updatedAt: store.now(),
    attempts: 0,
    error: '',
    job: j,
  };
  store.saveApplication(a);
  store.event(`Queued ${j.title}`, 'info', a.id);
  return a;
});
app.post('/api/applications/:id/prepare', async (req: any) => {
  const aid = pid.parse(req.params.id);
  return withApplicationLock(aid, async () => {
    const a = getApp(req);
    if (!['queued', 'needs_user', 'failed'].includes(a.stage) || hasSession(a.id))
      throw new Error('Close the browser before preparing new documents');
    const p = store.profile();
    if (!p.confirmed) throw new Error('Confirm your profile first');
    const { useModel } = z.object({ useModel: z.boolean() }).parse(req.body);
    store.update(a.id, { stage: 'preparing', message: 'Preparing application documents…' });
    try {
      const packet = await preparePacket(p, a.job, useModel);
      await renderPDF(a.id, packet.resumeText);
      return store.update(a.id, {
        packet,
        profileVersion: p.version,
        profileSnapshot: p,
        stage: 'needs_user',
        message: 'Documents are ready. Open the browser to continue.',
      });
    } catch (e) {
      store.update(a.id, { stage: 'needs_user', message: (e as Error).message });
      throw e;
    }
  });
});
app.post('/api/applications/:id/packet', async (req: any) => {
  const aid = pid.parse(req.params.id);
  return withApplicationLock(aid, async () => {
    const a = getApp(req);
    if (['submitting', 'submitted', 'unknown'].includes(a.stage))
      throw new Error('Cannot change documents after submission');
    if (hasSession(a.id)) throw new Error('Close the browser before changing the document');
    const { resumeText, coverLetter } = z
      .object({ resumeText: str, coverLetter: str })
      .parse(req.body);
    await renderPDF(a.id, resumeText);
    return store.update(a.id, {
      packet: {
        resumeText,
        coverLetter,
        selectedFactIds: a.packet?.selectedFactIds || [],
        model: 'Reviewed by you',
        coverLetterConfirmed: true,
        generatedAt: store.now(),
      },
      snapshotHash: '',
    });
  });
});
app.post('/api/applications/:id/resume', async (req: any, reply) => {
  const a = getApp(req);
  if (['submitting', 'submitted', 'unknown', 'skipped'].includes(a.stage))
    throw new Error('This application cannot be resumed in its current state');
  reply.code(202);
  void exclusiveProcess(a.id).catch((e) => store.event(e.message, 'warning', a.id));
  return { message: 'Browser operation started' };
});
app.post('/api/applications/:id/answers', async (req: any) => {
  const a = getApp(req);
  const { answers } = z
    .object({
      answers: z
        .array(z.object({ id: z.string(), value: z.string().max(10000), save: z.boolean() }))
        .max(100),
    })
    .parse(req.body);
  await applyAnswers(a.id, answers);
  return store.application(a.id);
});
app.post('/api/applications/:id/approve', async (req: any) => {
  const a = getApp(req);
  const { snapshotHash } = z.object({ snapshotHash: z.string().min(1) }).parse(req.body);
  await submitApplication(a.id, snapshotHash);
  return store.application(a.id);
});
app.post('/api/applications/:id/close', async (req: any) => {
  const aid = pid.parse(req.params.id);
  return withApplicationLock(aid, async () => {
    const a = getApp(req);
    if (a.stage === 'submitting') throw new Error('Submission is in progress');
    await closeSession(a.id);
    if (!['submitted', 'unknown', 'skipped'].includes(a.stage))
      store.update(a.id, {
        stage: 'needs_user',
        snapshotHash: '',
        message: 'Browser closed. Resume when you are ready.',
      });
    return { ok: true };
  });
});
app.post('/api/applications/:id/skip', async (req: any) => {
  const aid = pid.parse(req.params.id);
  return withApplicationLock(aid, async () => {
    const a = getApp(req);
    if (['submitted', 'submitting', 'unknown'].includes(a.stage))
      throw new Error('Cannot skip a submitted or uncertain application');
    await closeSession(a.id);
    return store.update(a.id, { stage: 'skipped', message: 'Skipped by you' });
  });
});
app.post('/api/applications/:id/reconcile', async (req: any) => {
  const aid = pid.parse(req.params.id);
  return withApplicationLock(aid, async () => {
    const a = getApp(req);
    if (a.stage !== 'unknown') throw new Error('Only uncertain submissions can be reconciled');
    const d = z
      .object({ submitted: z.boolean(), confirmation: z.string().min(5).max(1000) })
      .parse(req.body);
    if (d.submitted) {
      const receipt = {
        submittedAt: store.now(),
        url: a.job.url,
        confirmation: 'Manually confirmed: ' + d.confirmation,
        fields: a.fields.map((f) => ({ label: f.label, value: f.value })),
        resumeHash: existsSync(path.join(store.dataDir, 'documents', `${a.id}.pdf`))
          ? hash(await readFile(path.join(store.dataDir, 'documents', `${a.id}.pdf`)))
          : '',
        intentHash: 'manually-reconciled',
        practice: a.job.practice,
      };
      await saveReceipt(a.id, receipt);
      store.update(a.id, { stage: 'submitted', receipt, message: receipt.confirmation });
    } else
      store.update(a.id, {
        stage: 'needs_user',
        snapshotHash: '',
        message: 'You confirmed no submission occurred: ' + d.confirmation,
      });
    await closeSession(a.id);
    return store.application(a.id);
  });
});
app.get('/api/applications/:id/:artifact', async (req: any, reply) => {
  const a = getApp(req);
  const type = z.enum(['resume.pdf', 'screenshot.png', 'receipt.json']).parse(req.params.artifact);
  const file =
    type === 'resume.pdf'
      ? path.join(store.dataDir, 'documents', `${a.id}.pdf`)
      : path.join(
          store.dataDir,
          'receipts',
          `${a.id}.${type === 'screenshot.png' ? 'png' : 'json'}`,
        );
  if (!existsSync(file)) return reply.code(404).send({ error: 'Artifact not created yet' });
  reply.type(
    type === 'resume.pdf'
      ? 'application/pdf'
      : type === 'screenshot.png'
        ? 'image/png'
        : 'application/json',
  );
  return reply.send(await readFile(file));
});
app.post('/api/sources', async (req) => {
  const d = z
    .object({
      ats: z.enum([
        'greenhouse',
        'lever',
        'ashby',
        'smartrecruiters',
        'workable',
        'remotive',
        'remoteok',
        'arbeitnow',
        'adzuna',
        'usajobs',
        'jooble',
      ]),
      board: z.string().regex(/^[a-zA-Z0-9_-]{0,150}$/),
      region: z.enum(['global', 'eu']).optional(),
      label: z.string().max(200),
    })
    .parse(req.body);
  if (catalog.find((c) => c.kind === d.ats)?.requiresBoard && !d.board)
    throw new Error('This source requires a board identifier or country code');
  if (
    store
      .sources()
      .some(
        (s) =>
          s.ats === d.ats &&
          s.board === d.board &&
          (d.ats !== 'lever' || (s.region || 'global') === (d.region || 'global')),
      )
  )
    throw new Error('This career board is already in your watchlist');
  const source: WatchSource = {
    ...d,
    id: store.id(),
    enabled: true,
    lastSync: '',
    lastError: '',
    manualOnly: catalog.find((c) => c.kind === d.ats)?.requiresKey || false,
  };
  store.saveSource(source);
  return source;
});
app.post('/api/sources/:id/sync', async (req: any) => {
  const source = store.sources().find((s) => s.id === pid.parse(req.params.id));
  if (!source) throw new Error('Career board not found');
  return { count: await syncSource(source) };
});
app.delete('/api/sources/:id', async (req: any) => {
  store.deleteSource(pid.parse(req.params.id));
  return { ok: true };
});
app.get('/api/export', () => ({
  exportedAt: store.now(),
  profile: store.profile(),
  settings: store.settings(),
  jobs: store.jobs(),
  applications: store.applications(),
  sources: store.sources(),
}));
const practiceHTML = `<!doctype html><html><head><meta charset="utf-8"><title>Apply Jobs · Practice</title><style>body{font:16px/1.6 system-ui;background:#f5f7f6;color:#19352b;max-width:650px;margin:50px auto;padding:24px}form{background:white;padding:32px;border-radius:20px}label{display:block;margin:18px 0}input,textarea{display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:8px;border:1px solid #cdd8d2;border-radius:8px;font:inherit}button{background:#244d3c;color:white;border:0;border-radius:9px;padding:14px 24px;font:inherit}.tag{color:#426b54}</style></head><body><p class="tag">APPLY JOBS / LOCAL PRACTICE</p><h1>Product Engineer</h1><p>This form lives on your computer. Submitting it does not contact an employer.</p><form method="post" action="/practice/complete" enctype="multipart/form-data"><label>Full name<input name="name" required autocomplete="name"></label><label>Email<input name="email" type="email" required></label><label>Location<input name="location" required></label><label>Résumé<input type="file" name="resume" accept=".pdf" required></label><label>What kind of work are you looking for?<textarea name="motivation" required></textarea></label><button type="submit">Submit application</button></form></body></html>`;
app.get('/practice/apply', (_, reply) => reply.type('text/html').send(practiceHTML));
app.post('/practice/complete', async (req, reply) => {
  for await (const part of req.parts()) {
    if (part.type === 'file') await part.toBuffer();
  }
  return reply
    .type('text/html')
    .send(
      '<!doctype html><html><head><title>Practice complete</title></head><body style="font:20px system-ui;max-width:650px;margin:100px auto"><h1>Thank you for your application!</h1><p>Your practice application was submitted successfully.</p><p>This was a local exercise. No employer was contacted. Return to Apply Jobs to view your receipt.</p></body></html>',
    );
});
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist, prefix: '/' });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/')
      ? reply.code(404).send({ error: 'Not found' })
      : reply.sendFile('index.html'),
  );
}
await registerUpgradeRoutes(app, refreshModels);
await app.listen({ port, host: '127.0.0.1' });
store.recover();
const previousRun = discoveryRun();
if (previousRun.status === 'running')
  store.setKV('discovery', { ...previousRun, status: 'completed', finishedAt: store.now() });
await startLocalModel();
void refreshModels();
console.log(
  `\n  Apply Jobs is running at http://127.0.0.1:${port}\n  Private data: ${store.dataDir}\n`,
);
let syncing = false;
const sourceAttempts = new Map<string, number>();
const timer = setInterval(() => {
  void enqueueTick().catch((e) => store.event(e.message, 'warning'));
  if (!syncing && !store.settings().paused) {
    const s = store
      .sources()
      .find(
        (s) =>
          s.enabled &&
          !s.manualOnly &&
          (!s.nextSync || Date.parse(s.nextSync) <= Date.now()) &&
          Date.now() - (sourceAttempts.get(s.id) || 0) > 60000,
      );
    if (s) {
      sourceAttempts.set(s.id, Date.now());
      syncing = true;
      void syncSource(s)
        .catch(() => {})
        .finally(() => (syncing = false));
    }
  }
  if (store.settings().autopilot && !store.settings().paused && store.profile().confirmed) {
    const cfg = store.settings();
    const existing = new Set(store.applications().map((a) => a.jobId));
    const j = store.jobs().find((j) => eligible(j, cfg) && matches(j, cfg) && !existing.has(j.id));
    if (j) {
      const a: Application = {
        id: store.id(),
        jobId: j.id,
        stage: 'queued',
        message: 'Queued by your Autopilot policy',
        fields: [],
        packet: null,
        profileVersion: store.profile().version,
        revision: 0,
        snapshotHash: '',
        receipt: null,
        createdAt: store.now(),
        updatedAt: store.now(),
        attempts: 0,
        error: '',
        job: j,
      };
      store.saveApplication(a);
      store.event(`Autopilot queued ${j.title}`, 'info', a.id);
    }
  }
}, 5000);
setInterval(() => void refreshModels(), 60000).unref();
async function shutdown() {
  clearInterval(timer);
  stopLocalModel();
  await shutdownBrowsers();
  await app.close();
  store.db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder = await mkdtemp(path.join(tmpdir(), 'apply-jobs-connected-'));
const port = 15318,
  modelPort = 15319,
  base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
let inferred = false;
const modelServer = createServer(async (req, res) => {
  if (req.url === '/v1/models') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'fixture-instruct' }] }));
    return;
  }
  if (req.url === '/v1/chat/completions') {
    assert.equal(req.headers.authorization, 'Bearer synthetic-provider-key');
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).response_format.type, 'json_schema');
    inferred = true;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    return;
  }
  if (req.url === '/api/tags') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ models: [{ name: 'fixture-local' }] }));
    return;
  }
  if (req.url === '/api/pull') {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.end(
      '{"status":"pulling manifest"}\n{"status":"pulling layer","digest":"abc","total":100,"completed":70}\n{"status":"success"}\n',
    );
    return;
  }
  res.writeHead(404).end();
});
await new Promise<void>((r) => modelServer.listen(modelPort, '127.0.0.1', r));
async function api(
  route: string,
  body?: unknown,
  method?: string,
  headers: Record<string, string> = {},
) {
  const r = await fetch(base + '/api' + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'X-Apply-Jobs': 'local',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d as any).error);
  return d as any;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<any>, predicate: (x: any) => boolean) {
  for (let i = 0; i < 100; i++) {
    try {
      const value = await fn();
      if (predicate(value)) return value;
    } catch {}
    await sleep(200);
  }
  throw new Error('Verification timed out');
}
try {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), APPLY_JOBS_DATA: folder, APPLY_JOBS_HEADLESS: '1' },
    stdio: 'ignore',
  });
  await until(
    () => api('/health'),
    (v) => v.status === 'ok',
  );
  const config = await api('/models/connect', {
    provider: 'compatible',
    baseUrl: `http://127.0.0.1:${modelPort}/v1`,
    model: 'fixture-instruct',
    apiKey: 'synthetic-provider-key',
  });
  assert.equal(config.connected, true);
  const inference = await api('/models/test', {});
  assert.equal(inference.ok, true);
  assert.equal(inferred, true);
  const state = await api('/state');
  assert.equal(state.integrations.modelApiKey, true);
  assert.ok(!JSON.stringify(state).includes('synthetic-provider-key'));
  assert.ok(!JSON.stringify(await api('/export')).includes('synthetic-provider-key'));
  assert.ok(
    !(await readFile(path.join(folder, 'vault.enc'))).includes(
      Buffer.from('synthetic-provider-key'),
    ),
  );
  const { code } = await api('/extension/pair-code', {});
  const origin = 'chrome-extension://' + 'a'.repeat(32);
  const preflight = await fetch(base + '/api/extension/pair', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, X-Apply-Jobs',
    },
  });
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  const { token } = await api('/extension/pair', { code }, 'POST', {
    Origin: origin,
    'X-Apply-Jobs': 'extension',
  });
  const saved = await api(
    '/extension/capture',
    {
      url: 'https://example.com/job',
      title: 'Frontend Engineer',
      company: 'Example',
      location: 'Remote',
      description: 'React TypeScript role',
    },
    'POST',
    { Origin: origin, 'X-Apply-Jobs': 'extension', Authorization: 'Bearer ' + token },
  );
  assert.ok(saved.id);
  const results = await api('/jobs/search?matching=false&sort=newest');
  assert.equal(results.total, 1);
  assert.equal(results.jobs[0].title, 'Frontend Engineer');
  await api('/extension/revoke', {});
  await assert.rejects(
    api(
      '/extension/capture',
      { url: 'https://example.com/job', title: 'x', company: '', location: '', description: '' },
      'POST',
      { Origin: origin, 'X-Apply-Jobs': 'extension', Authorization: 'Bearer ' + token },
    ),
    /Pair/,
  );
  const catalog = await api('/catalog');
  assert.equal(catalog.sources.length, 11);
  const source = await api('/sources', { ats: 'usajobs', board: '', label: 'Federal jobs' });
  assert.equal(source.manualOnly, true);
  await assert.rejects(api(`/sources/${source.id}/sync`, {}), /API key/);
  const bad = await api('/state');
  assert.ok(bad.sources[0].lastError.includes('API key'));
  assert.equal(bad.jobs.length, 1);
  await api('/models/connect', {
    provider: 'ollama',
    baseUrl: `http://127.0.0.1:${modelPort}`,
    model: 'fixture-local',
  });
  await api('/models/pull', { model: 'fixture-local' });
  const pull = await until(
    () => api('/models/pull'),
    (s) => s.status === 'completed',
  );
  assert.equal(pull.percent, 100);
  console.log(
    'PASS: authenticated compatible-model onboarding and inference; keys stay encrypted and out of API/export; paired extension capture and revocation; paginated discovery; missing-key errors preserve jobs; native Ollama pull progress.',
  );
} finally {
  child?.kill('SIGTERM');
  await sleep(700);
  await new Promise<void>((r) => modelServer.close(() => r()));
  await rm(folder, { recursive: true, force: true });
}

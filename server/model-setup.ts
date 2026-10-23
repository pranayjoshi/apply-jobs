import { installStatus } from './installer.ts';
import { totalmem, platform } from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { settings, setKV, dataDir } from './store.ts';
import { setSecrets, secretStatus, redact } from './secrets.ts';
import { modelStatus, generate } from './llm.ts';
export interface PullState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  model: string;
  message: string;
  percent: number;
  error: string;
}
let pull: PullState = { status: 'idle', model: '', message: '', percent: 0, error: '' };
let controller: AbortController | undefined;
export const pullStatus = () => ({ ...pull });
export function runtimeInfo() {
  return {
    installer: installStatus(),
    platform: platform(),
    memoryGB: Math.round(totalmem() / 1024 ** 3),
    managedOllama:
      existsSync(path.join(dataDir, 'runtime', platform() === 'win32' ? 'ollama.exe' : 'ollama')) ||
      existsSync(path.join(dataDir, 'runtime', 'bin', 'ollama')),
    pull: pullStatus(),
    recommendedModels: [
      {
        id: 'qwen3:4b',
        name: 'Qwen3 4B',
        size: '2.5 GB',
        memory: 'Recommended for 12 GB+ RAM',
        recommended: totalmem() > 10 * 1024 ** 3,
      },
      {
        id: 'qwen3:1.7b',
        name: 'Qwen3 1.7B',
        size: '1.4 GB',
        memory: 'Lighter option for smaller computers',
        recommended: totalmem() <= 10 * 1024 ** 3,
      },
    ],
  };
}
export async function connectModel(input: {
  provider: 'ollama' | 'compatible';
  baseUrl: string;
  model?: string;
  apiKey?: string;
}) {
  const u = new URL(input.baseUrl);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Use a model server URL without embedded credentials');
  const old = settings();
  if (input.apiKey?.trim()) setSecrets({ modelApiKey: input.apiKey });
  else if (new URL(old.baseUrl).origin !== u.origin) setSecrets({ modelApiKey: '__DELETE__' });
  setKV('settings', {
    ...old,
    provider: input.provider,
    baseUrl: input.baseUrl.replace(/\/$/, ''),
    model: input.model || '',
  });
  return modelStatus();
}
export async function testModel() {
  const start = Date.now();
  try {
    const result = await generate(
      'Connectivity test. Return {"ok": true}.',
      { test: 'Return a schema-valid object with ok true.' },
      z.object({ ok: z.boolean() }),
    );
    if (result.ok !== true) throw new Error('Model did not follow the test instruction');
    return { ok: true, milliseconds: Date.now() - start, model: settings().model };
  } catch (e) {
    throw new Error('Inference test failed: ' + redact((e as Error).message));
  }
}
export async function startPull(model: string) {
  if (pull.status === 'running') throw new Error('A model is already downloading');
  if (!/^[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?$/.test(model))
    throw new Error('Use a model name such as qwen3:4b');
  const s = settings(),
    u = new URL(s.baseUrl);
  if (s.provider !== 'ollama' || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
    throw new Error('Downloads are supported only for a local Ollama server');
  controller = new AbortController();
  pull = { status: 'running', model, message: 'Getting model manifest…', percent: 0, error: '' };
  const activeController = controller;
  void (async () => {
    try {
      const r = await fetch(s.baseUrl.replace(/\/$/, '') + '/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: true }),
        signal: activeController.signal,
      });
      if (!r.ok || !r.body) throw new Error(`Ollama returned HTTP ${r.status}`);
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let buffered = '';
      const layers = new Map<string, { total: number; completed: number }>();
      const consume = (line: string) => {
        if (!line.trim()) return;
        const d = JSON.parse(line);
        if (d.error) throw new Error(d.error);
        pull.message = d.status || 'Downloading…';
        if (d.digest && d.total)
          layers.set(d.digest, { total: d.total, completed: d.completed || 0 });
        const totals = [...layers.values()].reduce(
          (sum, x) => ({ total: sum.total + x.total, completed: sum.completed + x.completed }),
          { total: 0, completed: 0 },
        );
        pull.percent = totals.total
          ? Math.min(99, Math.round((totals.completed / totals.total) * 100))
          : 0;
        if (d.status === 'success') {
          pull.status = 'completed';
          pull.percent = 100;
          pull.message = 'Model ready';
          setKV('settings', { ...settings(), model });
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() || '';
        for (const line of lines) consume(line);
      }
      if (buffered.trim()) consume(buffered);
      if (pull.status !== 'completed')
        throw new Error('Download ended before Ollama confirmed success');
    } catch (e) {
      pull.status = 'failed';
      pull.error = activeController.signal.aborted
        ? 'Download canceled. Start again to resume.'
        : redact((e as Error).message);
      pull.message = pull.error;
    }
  })();
  return pullStatus();
}
export function cancelPull() {
  controller?.abort();
  return { ok: true };
}

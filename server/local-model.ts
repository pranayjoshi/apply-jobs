import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { dataDir, settings } from './store.ts';
let owned: ChildProcess | undefined;
// Only a project-local Ollama runtime installed by the owner is managed here.
export async function startLocalModel() {
  let binary = path.join(
    dataDir,
    'runtime',
    process.platform === 'win32' ? 'ollama.exe' : 'ollama',
  );
  if (!existsSync(binary) && existsSync(path.join(dataDir, 'runtime', 'bin', 'ollama')))
    binary = path.join(dataDir, 'runtime', 'bin', 'ollama');
  if (
    !existsSync(binary) ||
    settings().provider !== 'ollama' ||
    !/^http:\/\/(localhost|127\.0\.0\.1):11434\/?$/.test(settings().baseUrl)
  )
    return;
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1000) });
    if (r.ok) return;
  } catch {}
  const fd = openSync(path.join(dataDir, 'ollama.log'), 'a', 0o600);
  owned = spawn(binary, ['serve'], {
    env: {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11434',
      OLLAMA_MODELS: path.join(dataDir, 'models'),
      OLLAMA_NO_CLOUD: '1',
    },
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  owned.on('error', (e) => console.error('Local model server:', e.message));
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(700),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
export function stopLocalModel() {
  owned?.kill('SIGTERM');
  owned = undefined;
}

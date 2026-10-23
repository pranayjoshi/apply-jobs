import { platform, arch } from 'node:os';
import { mkdir, rm, rename } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { dataDir } from './store.ts';
import { startLocalModel } from './local-model.ts';
const run = promisify(execFile);
let status = { state: 'idle', message: '', percent: 0, error: '' };
export const installStatus = () => ({
  ...status,
  supported: ['darwin', 'linux'].includes(platform()),
});
export function installOllama() {
  if (status.state === 'running') return installStatus();
  if (!['darwin', 'linux'].includes(platform()))
    throw new Error('Install Ollama from ollama.com/download, then return here to connect');
  const binary = path.join(dataDir, 'runtime', 'ollama');
  if (existsSync(binary) || existsSync(path.join(dataDir, 'runtime', 'bin', 'ollama'))) {
    status = {
      state: 'completed',
      message: 'Ollama is already installed in this workspace',
      percent: 100,
      error: '',
    };
    return installStatus();
  }
  status = {
    state: 'running',
    message: 'Finding the official Ollama release…',
    percent: 0,
    error: '',
  };
  void (async () => {
    const staging = path.join(dataDir, 'runtime-download');
    try {
      await mkdir(staging, { recursive: true, mode: 0o700 });
      const r = await fetch('https://api.github.com/repos/ollama/ollama/releases/latest', {
        headers: { 'User-Agent': 'ApplyJobs-local-model-setup' },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error('Could not read the official Ollama release');
      const release = (await r.json()) as any;
      const name =
        platform() === 'darwin'
          ? 'ollama-darwin.tgz'
          : `ollama-linux-${arch() === 'arm64' ? 'arm64' : 'amd64'}.tgz`;
      const asset = release.assets.find((a: any) => a.name === name);
      if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || ''))
        throw new Error(
          'No verified release archive found for this system. Use the official manual installer.',
        );
      if (
        !asset.browser_download_url.startsWith(
          'https://github.com/ollama/ollama/releases/download/',
        )
      )
        throw new Error('Unexpected download source');
      const res = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(600000) });
      if (!res.ok || !res.body) throw new Error('Official archive download failed');
      const archive = path.join(staging, 'ollama.tgz'),
        hash = createHash('sha256');
      let bytes = 0;
      status.message = 'Downloading official Ollama runtime…';
      await pipeline(
        Readable.fromWeb(res.body as any),
        new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > 2.5e9) {
              callback(new Error('Runtime archive exceeds the setup limit'));
              return;
            }
            hash.update(chunk);
            status.percent = Math.min(95, Math.round((bytes / asset.size) * 95));
            callback(null, chunk);
          },
        }),
        createWriteStream(archive, { mode: 0o600 }),
      );
      if ('sha256:' + hash.digest('hex') !== asset.digest)
        throw new Error('Archive checksum mismatch. Nothing was installed.');
      status.message = 'Verified checksum. Preparing the local runtime…';
      const extracted = path.join(staging, 'extracted');
      await mkdir(extracted, { recursive: true });
      const inventory = await run('tar', ['-tzf', archive], { maxBuffer: 5_000_000 });
      if (
        inventory.stdout.split('\n').some((p) => p.startsWith('/') || p.split('/').includes('..'))
      )
        throw new Error('Unexpected archive paths');
      await run('tar', ['-xzf', archive, '-C', extracted]);
      if (
        !existsSync(path.join(extracted, 'ollama')) &&
        !existsSync(path.join(extracted, 'bin', 'ollama'))
      )
        throw new Error('Ollama executable was not found in the archive');
      await rename(extracted, path.join(dataDir, 'runtime'));
      await startLocalModel();
      status = {
        state: 'completed',
        message: 'Ollama is ready. Download a model below.',
        percent: 100,
        error: '',
      };
    } catch (e) {
      status = {
        state: 'failed',
        message: 'Installation did not complete',
        percent: 0,
        error: (e as Error).message,
      };
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  })();
  return installStatus();
}

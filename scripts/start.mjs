import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const candidates = [
  process.execPath,
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'),
  '/opt/homebrew/bin/node',
  '/usr/local/bin/node',
];
const node = candidates.find((binary) => {
  if (!existsSync(binary)) return false;
  const version = spawnSync(binary, ['-p', 'process.versions.node'], { encoding: 'utf8' });
  return version.status === 0 && Number(version.stdout.split('.')[0]) >= 24;
});
if (!node) {
  console.error(
    'Apply Jobs needs Node.js 24 or newer. Install Node 24 LTS and run npm start again.',
  );
  process.exit(1);
}
const child = spawn(node, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  cwd: process.cwd(),
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));

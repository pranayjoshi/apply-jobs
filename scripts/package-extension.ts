import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
const files: Record<string, Uint8Array> = {};
for (const name of await readdir('extension')) {
  if (/\.(json|js|html|css|md|png|svg)$/.test(name))
    files[name] = await readFile(path.join('extension', name));
}
await mkdir('public/downloads', { recursive: true });
await writeFile('public/downloads/apply-jobs-extension.zip', zipSync(files));
console.log('Packaged browser extension.');

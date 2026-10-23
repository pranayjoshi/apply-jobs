import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from './store.ts';
const keyPath = path.join(dataDir, 'vault.key');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
const key = readFileSync(keyPath);
const file = path.join(dataDir, 'vault.enc');
function read(): Record<string, string> {
  if (!existsSync(file)) return {};
  const raw = readFileSync(file);
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(),
  );
}
export function secret(name: string) {
  return read()[name] || '';
}
export function setSecrets(values: Record<string, string>) {
  const data = read();
  for (const [name, value] of Object.entries(values)) {
    if (value === '__DELETE__') delete data[name];
    else if (name === 'imapPassword' && value.length) data[name] = value;
    else if (value.trim()) data[name] = value.trim();
  }
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  writeFileSync(file + '.tmp', Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
    mode: 0o600,
  });
  renameSync(file + '.tmp', file);
}
export function secretStatus() {
  return Object.fromEntries(Object.entries(read()).map(([name, value]) => [name, !!value]));
}
export function redact(text: string) {
  let out = text;
  for (const value of Object.values(read()))
    if (value.length > 3) out = out.split(value).join('[redacted]');
  return out;
}

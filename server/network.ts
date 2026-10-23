import { lookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { Agent } from 'undici';
export function privateIP(ip: string): boolean {
  if (ip.includes(':'))
    return !/^[23][0-9a-f]{3}:/i.test(ip) || ip.toLowerCase().startsWith('2001:db8:');
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
async function validatedURL(input: string): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const u = new URL(input);
  if (
    !['https:', 'http:'].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !['443', '80'].includes(u.port))
  )
    throw new Error('Use a public HTTP or HTTPS job URL');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('Private network addresses are not allowed');
  const family = isIP(host);
  const addresses: LookupAddress[] = family
    ? [{ address: host, family }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((i) => privateIP(i.address)))
    throw new Error('Private network addresses are not allowed');
  return { url: u, addresses };
}
export async function publicURL(input: string): Promise<URL> {
  return (await validatedURL(input)).url;
}
export async function publicFetch(
  input: string,
  maxBytes = 3_000_000,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ text: string; url: string }> {
  let { url: u, addresses } = await validatedURL(input);
  for (let i = 0; i < 6; i++) {
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
    const lookupPinned = (
      hostname: string,
      lookupOptions: LookupOptions,
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string | LookupAddress[],
        family?: number,
      ) => void,
    ) => {
      const requestedHost = hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
      if (requestedHost !== host) {
        const error = Object.assign(new Error('Unexpected host lookup'), { code: 'ENOTFOUND' });
        callback(error, '', 0);
        return;
      }
      const matching = addresses.filter(
        (entry) =>
          !lookupOptions.family ||
          lookupOptions.family === entry.family ||
          lookupOptions.family === `IPv${entry.family}`,
      );
      if (lookupOptions.all) callback(null, matching);
      else if (matching[0]) callback(null, matching[0].address, matching[0].family);
      else {
        const error = Object.assign(new Error('No address for requested family'), {
          code: 'ENOTFOUND',
        });
        callback(error, '', 0);
      }
    };
    const dispatcher = new Agent({ connect: { lookup: lookupPinned } });
    try {
      const r = await fetch(u, {
        ...options,
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: {
          'User-Agent': 'ApplyJobs/0.1 (personal career assistant)',
          Accept: 'application/json,text/html',
          ...options.headers,
        },
      });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const l = r.headers.get('location');
        await r.body?.cancel();
        if (!l) throw new Error('Invalid redirect');
        const next = await validatedURL(new URL(l, u).href);
        if (options.headers && next.url.origin !== u.origin)
          throw new Error('Authenticated redirects to another origin are not allowed');
        u = next.url;
        addresses = next.addresses;
        continue;
      }
      if (!r.ok) {
        await r.body?.cancel();
        throw new Error(`Source returned HTTP ${r.status}`);
      }
      const reader = r.body?.getReader();
      if (!reader) throw new Error('Empty response');
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error('Source response is too large');
        }
        chunks.push(value);
      }
      return { text: Buffer.concat(chunks).toString('utf8'), url: u.href };
    } finally {
      await dispatcher.close();
    }
  }
  throw new Error('Too many redirects');
}

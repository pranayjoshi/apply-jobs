import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export type BrowserChoice = 'system' | 'chrome' | 'edge' | 'chromium';
const run = promisify(execFile);
export function identifyBrowser(id: string): 'chrome' | 'edge' | undefined {
  const value = id.toLowerCase();
  if (/google\.chrome|google-chrome|chromehtml/.test(value)) return 'chrome';
  if (/com\.microsoft\.edgemac|microsoft-edge|msedge/.test(value)) return 'edge';
}
export function parseDefaultBrowserPlist(xml: string): string | undefined {
  const flat = xml.replace(/<key>LSHandlerPreferredVersions<\/key>\s*<dict>[\s\S]*?<\/dict>/g, '');
  for (const entry of flat.match(/<dict>[\s\S]*?<\/dict>/g) || []) {
    if (/<key>LSHandlerURLScheme<\/key>\s*<string>https<\/string>/.test(entry))
      return entry.match(/<key>LSHandlerRoleAll<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  }
}
async function defaultBrowser(): Promise<string> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await run(
        '/usr/bin/defaults',
        ['export', 'com.apple.LaunchServices/com.apple.launchservices.secure', '-'],
        { timeout: 3000 },
      );
      return parseDefaultBrowserPlist(stdout) || 'System browser';
    }
    if (process.platform === 'linux')
      return (
        await run('xdg-settings', ['get', 'default-web-browser'], { timeout: 3000 })
      ).stdout.trim();
    if (process.platform === 'win32')
      return (
        await run(
          'reg',
          [
            'query',
            'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice',
            '/v',
            'ProgId',
          ],
          { timeout: 3000 },
        )
      ).stdout;
  } catch {}
  return 'System browser';
}
const systemId = await defaultBrowser();
export function browserPlan(choice: BrowserChoice = 'system') {
  const selected = choice === 'system' ? identifyBrowser(systemId) : choice;
  return {
    choice,
    systemName: /safari/i.test(systemId)
      ? 'Safari'
      : identifyBrowser(systemId) === 'chrome'
        ? 'Google Chrome'
        : identifyBrowser(systemId) === 'edge'
          ? 'Microsoft Edge'
          : 'System browser',
    mode: selected ? ('managed' as const) : ('external' as const),
    channel:
      selected === 'chrome'
        ? ('chrome' as const)
        : selected === 'edge'
          ? ('msedge' as const)
          : undefined,
    profile: selected || 'system',
  };
}
export async function openSystemBrowser(url: string) {
  const u = new URL(url);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Invalid browser URL');
  if (process.platform === 'darwin') await run('/usr/bin/open', [u.href], { timeout: 5000 });
  else if (process.platform === 'win32')
    await run('rundll32.exe', ['url.dll,FileProtocolHandler', u.href], { timeout: 5000 });
  else await run('xdg-open', [u.href], { timeout: 5000 });
}

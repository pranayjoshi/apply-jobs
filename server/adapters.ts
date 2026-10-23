import type { Page, Locator } from 'playwright';
export interface Adapter {
  id: string;
  name: string;
  domains: string[];
  mode: 'automatic' | 'assisted' | 'capture';
  applyNames: RegExp;
  submitNames: RegExp;
  nextNames: RegExp;
  fieldContainer: string;
}
const submit = /^(submit(?: your)? application|send application|submit|apply)$/i;
export const adapters: Adapter[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    domains: ['greenhouse.io'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|apply for this position)$/i,
    submitNames: submit,
    nextNames: /^(next|continue)$/i,
    fieldContainer: '.field,.input-wrapper,[data-testid="field"],fieldset',
  },
  {
    id: 'lever',
    name: 'Lever',
    domains: ['lever.co'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?)$/i,
    submitNames: submit,
    nextNames: /^(next|continue)$/i,
    fieldContainer: '.application-question,.application-label,.custom-question,fieldset',
  },
  {
    id: 'ashby',
    name: 'Ashby',
    domains: ['ashbyhq.com'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|application)$/i,
    submitNames: submit,
    nextNames: /^(next|continue)$/i,
    fieldContainer: '[class*="application-form-field"],[class*="field-entry"],fieldset',
  },
  {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    domains: ['smartrecruiters.com'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|i.m interested)$/i,
    submitNames: /^(submit(?: application)?|send application|apply)$/i,
    nextNames: /^(next|continue|save and continue)$/i,
    fieldContainer: '[class*="form-field"],[class*="question"],fieldset',
  },
  {
    id: 'workable',
    name: 'Workable',
    domains: ['workable.com'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|apply for this position)$/i,
    submitNames: submit,
    nextNames: /^(next|continue)$/i,
    fieldContainer: '[data-ui="form-field"],[class*="form-field"],fieldset',
  },
  {
    id: 'workday',
    name: 'Workday',
    domains: ['myworkdayjobs.com'],
    mode: 'assisted',
    applyNames: /^(apply|apply manually|apply without autofill|apply now)$/i,
    submitNames: /^(submit|submit application)$/i,
    nextNames: /^(next|continue|save and continue)$/i,
    fieldContainer: '[data-automation-id="formField"],[data-automation-id^="formField-"],fieldset',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    domains: ['linkedin.com'],
    mode: 'capture',
    applyNames: /^apply(?: on company website)?$/i,
    submitNames: /^__no_automatic_submission__$/,
    nextNames: /^__no_automatic_navigation__$/,
    fieldContainer: 'fieldset',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    domains: ['indeed.com'],
    mode: 'capture',
    applyNames: /^apply on company (?:site|website)$/i,
    submitNames: /^__no_automatic_submission__$/,
    nextNames: /^__no_automatic_navigation__$/,
    fieldContainer: 'fieldset',
  },
  {
    id: 'custom',
    name: 'General application',
    domains: [],
    mode: 'assisted',
    applyNames: /^(apply|apply now|apply for this job|apply for this role)$/i,
    submitNames: submit,
    nextNames: /^(next|continue|save and continue|next step)$/i,
    fieldContainer: 'fieldset,[class*="form-field"]',
  },
];
export function adapterFor(url: string) {
  const h = new URL(url).hostname;
  return (
    adapters.find((a) => a.domains.some((d) => h === d || h.endsWith('.' + d))) ||
    adapters[adapters.length - 1]
  );
}
export async function findButton(
  page: Page,
  kind: 'submit' | 'next' | 'apply',
): Promise<Locator | null> {
  const adapter = adapterFor(page.url());
  const name =
    kind === 'submit'
      ? adapter.submitNames
      : kind === 'next'
        ? adapter.nextNames
        : adapter.applyNames;
  for (const frame of page.frames()) {
    for (const role of kind === 'apply' ? (['link', 'button'] as const) : (['button'] as const)) {
      const candidates = frame.getByRole(role, { name });
      for (const item of await candidates.all()) {
        if ((await item.isVisible()) && (await item.isEnabled())) return item;
      }
    }
  }
  return null;
}
export async function enterApplication(page: Page) {
  const adapter = adapterFor(page.url());
  if (adapter.mode === 'capture') {
    for (const frame of page.frames()) {
      const links = frame.locator('a[href]');
      const urls = await links.evaluateAll((nodes) =>
        nodes.map((n) => ({
          url: (n as HTMLAnchorElement).href,
          text: (n as HTMLElement).innerText,
        })),
      );
      const employer = urls.find(
        (l) =>
          /apply/i.test(l.text) &&
          /greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workable\.com/.test(
            l.url,
          ),
      );
      if (employer) {
        await page.goto(employer.url, { waitUntil: 'domcontentloaded' });
        return true;
      }
    }
    return false;
  }
  const button = await findButton(page, 'apply');
  if (!button) return false;
  const before = page.url();
  const popup = page.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
  await button.click();
  const child = await popup;
  if (child) {
    await child.waitForLoadState('domcontentloaded');
    const url = child.url();
    await child.close();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  return before !== page.url() || !!button;
}

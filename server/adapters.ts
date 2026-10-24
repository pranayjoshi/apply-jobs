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
const submit =
  /^(submit(?: your| my)?(?: job)? application(?: to .+)?|send(?: my)? application|submit|apply)(?:\s*[›→»])?$/i;
const next =
  /^(next(?: step|: .+)?|(?:save and )?continue(?: to (?:application|review|next step))?)(?:\s*[›→»])?$/i;
export const adapters: Adapter[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    domains: ['greenhouse.io'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|apply for this position)$/i,
    submitNames: submit,
    nextNames: next,
    fieldContainer: '.field,.input-wrapper,[data-testid="field"],fieldset',
  },
  {
    id: 'lever',
    name: 'Lever',
    domains: ['lever.co'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?)$/i,
    submitNames: submit,
    nextNames: next,
    fieldContainer: '.application-question,.application-label,.custom-question,fieldset',
  },
  {
    id: 'ashby',
    name: 'Ashby',
    domains: ['ashbyhq.com'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|application)$/i,
    submitNames: submit,
    nextNames: next,
    fieldContainer: '[class*="application-form-field"],[class*="field-entry"],fieldset',
  },
  {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    domains: ['smartrecruiters.com'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|i.m interested)$/i,
    submitNames: /^(submit(?: application)?|send application|apply)$/i,
    nextNames: next,
    fieldContainer: '[class*="form-field"],[class*="question"],fieldset',
  },
  {
    id: 'workable',
    name: 'Workable',
    domains: ['workable.com'],
    mode: 'automatic',
    applyNames: /^(apply(?: now| for this job)?|apply for this position)$/i,
    submitNames: submit,
    nextNames: next,
    fieldContainer: '[data-ui="form-field"],[class*="form-field"],fieldset',
  },
  {
    id: 'workday',
    name: 'Workday',
    domains: ['myworkdayjobs.com'],
    mode: 'assisted',
    applyNames: /^(apply|apply manually|apply without autofill|apply now)$/i,
    submitNames: /^(submit|submit application)$/i,
    nextNames: next,
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
    nextNames: next,
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
  includeDisabled = false,
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
        if ((await item.isVisible()) && (includeDisabled || (await item.isEnabled()))) return item;
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
          ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'workable'].includes(
            adapterFor(l.url).id,
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

/** Wait for client-rendered career pages and follow ordinary application entry links. */
export async function reachApplication(
  page: Page,
  options: {
    ready: () => Promise<boolean>;
    blocked: () => Promise<boolean>;
    checkRunning: () => void;
    timeoutMs?: number;
  },
): Promise<'ready' | 'blocked' | 'unavailable'> {
  const deadline = Date.now() + (options.timeoutMs ?? 30000);
  const visited = new Set<string>();
  while (Date.now() < deadline && !page.isClosed()) {
    options.checkRunning();
    if (await options.blocked()) return 'blocked';
    if (await options.ready()) return 'ready';
    const button = await findButton(page, 'apply');
    if (button && visited.size < 6) {
      const key = JSON.stringify([
        page.url(),
        await button.innerText(),
        await button.getAttribute('href'),
      ]);
      if (!visited.has(key)) {
        visited.add(key);
        options.checkRunning();
        await enterApplication(page);
      }
    }
    await page.waitForTimeout(500);
  }
  return 'unavailable';
}

export async function formProblems(page: Page) {
  const problems: { id: string; message: string }[] = [];
  for (const frame of page.frames()) {
    try {
      problems.push(
        ...(await frame.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
              'input,select,textarea',
            ),
          )
            .filter(
              (el) =>
                el.willValidate &&
                (!document.querySelector('[data-aj-field]') || el.hasAttribute('data-aj-field')) &&
                !el.validity.valid &&
                (!!el.getClientRects().length || el.type === 'file'),
            )
            .map((el) => ({
              id: el.getAttribute('data-aj-field') || '',
              message: el.validationMessage || 'Check this field',
            })),
        )),
      );
    } catch {}
  }
  return problems;
}
export async function pageFingerprint(page: Page) {
  const frames = [];
  for (const frame of page.frames()) {
    try {
      frames.push(
        await frame.evaluate(() => ({
          url: location.href,
          text: document.body.innerText.slice(0, 24000),
          fields: Array.from(
            document.querySelectorAll<HTMLInputElement>('input,select,textarea'),
          ).map((el) => [el.name, el.type, el.value, el.checked, el.disabled]),
          actions: Array.from(
            document.querySelectorAll<HTMLButtonElement>('button,[role="button"]'),
          ).map((el) => [el.textContent, el.disabled, el.getAttribute('aria-disabled')]),
        })),
      );
    } catch {}
  }
  return JSON.stringify(frames);
}
export async function advancePage(page: Page, button: Locator) {
  const before = await pageFingerprint(page);
  await button.click({ timeout: 10000 });
  for (let i = 0; i < 32; i++) {
    await page.waitForTimeout(250);
    if ((await pageFingerprint(page)) !== before) return true;
    if ((await formProblems(page)).length) return false;
  }
  return false;
}

import { browserPlan, openSystemBrowser } from './browser.ts';
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  dataDir,
  application,
  applications,
  profile,
  settings,
  update,
  event,
  now,
} from './store.ts';
import type { Application, Field, Receipt } from '../src/types.ts';
import { eligible } from './jobs.ts';
import { matches, checkActive } from './discovery.ts';
import {
  adapterFor,
  findButton,
  enterApplication,
  reachApplication,
  adapters,
  formProblems,
  advancePage,
  pageFingerprint,
} from './adapters.ts';
import { answerField, normalize } from './answers.ts';
import { publicURL } from './network.ts';
import { renderPDF, renderPacket, hash, fileHash, saveReceipt } from './documents.ts';
import { preparePacket } from './llm.ts';
const sessions = new Map<string, { context: BrowserContext; page: Page }>();
let busy = false;
const browserWaits = new Map<string, { fingerprint: string; retries: number }>();
async function watchBrowser(aid: string, page: Page, waitingFor: 'authentication' | 'page') {
  const previous = browserWaits.get(aid);
  browserWaits.set(aid, {
    fingerprint: await pageFingerprint(page),
    retries: previous?.retries || 0,
  });
  update(aid, { waitingFor });
}

const applicationLocks = new Set<string>();
export async function withApplicationLock<T>(aid: string, operation: () => Promise<T>): Promise<T> {
  if (applicationLocks.has(aid))
    throw new Error('Another application operation is already running');
  applicationLocks.add(aid);
  try {
    return await operation();
  } finally {
    applicationLocks.delete(aid);
  }
}
const browserOptions = () => ({
  headless: settings().headless || process.env.APPLY_JOBS_HEADLESS === '1',
  ...(process.env.APPLY_JOBS_HEADLESS === '1'
    ? {}
    : { channel: browserPlan(settings().browser).channel }),
  ...(process.env.APPLY_JOBS_CHROME ? { executablePath: process.env.APPLY_JOBS_CHROME } : {}),
});
const checkRunning = () => {
  if (settings().paused) throw new Error('Automation is paused. Resume it before continuing.');
};
export function hasSession(aid: string) {
  return sessions.has(aid);
}
export async function closeSession(aid: string) {
  const s = sessions.get(aid);
  if (s) {
    sessions.delete(aid);
    browserWaits.delete(aid);
    await s.context.close().catch(() => {});
  }
}
async function openSession(a: Application) {
  if (sessions.has(a.id)) return sessions.get(a.id)!;
  if (sessions.size) throw new Error('Finish or close the current browser session first');
  const context = await chromium.launchPersistentContext(
    path.join(
      dataDir,
      'browser',
      browserPlan(settings().browser).profile === 'chromium' ||
        process.env.APPLY_JOBS_HEADLESS === '1'
        ? 'candidate'
        : browserPlan(settings().browser).profile,
    ),
    {
      ...browserOptions(),
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
      serviceWorkers: 'block',
    },
  );
  const practiceOrigin = `http://127.0.0.1:${process.env.PORT || 4318}`;
  let blockedHttpRequest = false;
  await context.route('**/*', async (route) => {
    const u = route.request().url();
    try {
      if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      if (a.job.practice && new URL(u).origin === practiceOrigin) return route.continue();
      if (!a.job.practice && new URL(u).protocol !== 'https:') {
        blockedHttpRequest = true;
        return route.abort();
      }
      await publicURL(u);
      await route.continue();
    } catch {
      await route.abort();
    }
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(7000);
  sessions.set(a.id, { context, page });
  context.on('close', () => {
    sessions.delete(a.id);
  });
  page.on('close', () => {
    sessions.delete(a.id);
    void context.close().catch(() => {});
  });
  try {
    await page.goto(a.job.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    return { context, page };
  } catch (e) {
    await closeSession(a.id);
    if (blockedHttpRequest)
      throw new Error(
        'The employer page used an insecure HTTP request. Use its HTTPS application link.',
      );
    throw e;
  }
}
export async function inspectFormFrame(
  frame: Frame,
  fi: number,
  adapterId?: string,
): Promise<Field[]> {
  return frame.evaluate(
    ({ index, container }) => {
      const elements = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input,textarea,select,[role="combobox"]',
        ),
      );
      const fields: any[] = [];
      const radioDone: { form: HTMLFormElement | null; name: string }[] = [];
      for (const [i, el] of elements.entries()) {
        const type = el.getAttribute('type') || el.tagName.toLowerCase();
        if (type === 'search' || el.closest('[role="search"]')) continue;
        if (el.getAttribute('role') === 'combobox' && el.querySelector('input,select,textarea'))
          continue;
        const form = (el as HTMLInputElement).form || el.closest('form');
        if (
          form &&
          /newsletter|subscribe|search/i.test(
            [
              form.id,
              form.getAttribute('name'),
              form.className,
              form.getAttribute('aria-label'),
            ].join(' '),
          )
        )
          continue;
        const applicationForms = Array.from(document.querySelectorAll('form')).filter(
          (f) =>
            f.querySelector('input[type="file"]') ||
            /application|resume|résumé|curriculum/i.test(
              [f.id, f.getAttribute('name'), f.getAttribute('aria-label')].join(' '),
            ),
        );
        if (applicationForms.length && !applicationForms.some((f) => f.contains(el))) continue;

        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type) || el.disabled)
          continue;
        if (!el.getClientRects().length && type !== 'file') continue;
        let label = el.getAttribute('aria-label') || '';
        const input = el as HTMLInputElement;
        if (input.labels?.length)
          label =
            Array.from(input.labels)
              .map((l) => l.innerText)
              .join(' ')
              .trim() || label;
        if (!label && el.getAttribute('aria-labelledby'))
          label = el
            .getAttribute('aria-labelledby')!
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent || '')
            .join(' ')
            .trim();
        if (!label)
          label =
            el.closest(container)?.querySelector('label,legend,[data-automation-id=\"formLabel\"]')
              ?.textContent || '';
        if (!label && el.id)
          label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent || '';
        if (!label)
          label =
            el.closest('label')?.textContent ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name') ||
            el.id ||
            `Field ${i + 1}`;
        label = label.replace(/[_]/g, ' ');
        let options: string[] = [];
        let group: HTMLInputElement[] = [];
        if (type === 'radio') {
          const name = el.getAttribute('name') || '';
          if (name) {
            if (radioDone.some((seen) => seen.form === input.form && seen.name === name)) continue;
            radioDone.push({ form: input.form, name });
            group = elements.filter((x) => {
              const radio = x as HTMLInputElement;
              return (
                radio.getAttribute('type') === 'radio' &&
                radio.getAttribute('name') === name &&
                radio.form === input.form &&
                !radio.disabled &&
                !!radio.getClientRects().length
              );
            }) as HTMLInputElement[];
          } else group = [input];
          label =
            el.closest('fieldset')?.querySelector('legend')?.textContent ||
            el.closest('[role="radiogroup"]')?.getAttribute('aria-label') ||
            name ||
            input.id ||
            `Field ${i + 1}`;
          options = group.map((x) => x.labels?.[0]?.innerText?.trim() || x.value);
        } else if (el.tagName === 'SELECT')
          options = Array.from((el as HTMLSelectElement).options)
            .map((o) => o.text)
            .filter(Boolean);
        const fieldId = `${index}-${i}`;
        el.setAttribute('data-aj-field', fieldId);
        group.forEach((x, n) => x.setAttribute('data-aj-radio', `${fieldId}-${n}`));
        fields.push({
          id: fieldId,
          label: label.replace(/\s+/g, ' ').trim().slice(0, 400),
          type,
          required:
            /\*/.test(label) ||
            (type === 'radio' &&
              (group.some((option) => option.required) ||
                el.closest('[role="radiogroup"]')?.getAttribute('aria-required') === 'true')) ||
            el.hasAttribute('required') ||
            el.getAttribute('aria-required') === 'true' ||
            !!el.closest('fieldset')?.hasAttribute('required'),
          options,
          value:
            type === 'radio'
              ? group.find((x) => x.checked)?.labels?.[0]?.innerText?.trim() ||
                group.find((x) => x.checked)?.value ||
                ''
              : type === 'checkbox'
                ? input.checked
                  ? 'Yes'
                  : 'No'
                : input.value ||
                  el.getAttribute('aria-valuetext') ||
                  (el.getAttribute('role') === 'combobox' ? el.textContent?.trim() : '') ||
                  '',
          answer: '',
          source: '',
          resolved: false,
        });
      }
      return fields;
    },
    {
      index: fi,
      container: (
        adapters.find((a) => a.id === adapterId) ||
        adapterFor(frame.url().startsWith('http') ? frame.url() : 'https://example.com')
      ).fieldContainer,
    },
  );
}
async function inspect(page: Page) {
  // Microsoft's posting includes a résumé-match upload, separate from applying.
  const current = new URL(page.url());
  if (
    current.hostname === 'apply.careers.microsoft.com' &&
    /^\/careers\/job\//.test(current.pathname)
  )
    return [];

  const result: Field[] = [];
  for (const [i, frame] of page.frames().entries()) {
    try {
      result.push(...(await inspectFormFrame(frame, i, adapterFor(page.url()).id)));
    } catch {}
  }
  const counts = new Map<string, number>();
  for (const field of result) {
    const count = counts.get(field.label) || 0;
    field.occurrence = count;
    counts.set(field.label, count + 1);
  }
  return result;
}
function frameFor(page: Page, f: Field) {
  return page.frames()[Number(f.id.split('-')[0])];
}
export async function fillFormField(page: Page, f: Field, value: string, aid: string) {
  const frame = frameFor(page, f);
  if (!frame) throw new Error('Form changed. Re-inspect the page.');
  const loc = frame.locator(`[data-aj-field="${f.id}"]`).first();
  if (f.type === 'file') {
    if (value)
      await loc.setInputFiles(
        path.join(dataDir, 'documents', /cover/i.test(f.label) ? `${aid}-cover.pdf` : `${aid}.pdf`),
      );
    return;
  }
  if (f.type === 'radio') {
    const idx = f.options.findIndex((x) => x === value);
    if (idx < 0) throw new Error('Choose a listed option');
    await frame.locator(`[data-aj-radio="${f.id}-${idx}"]`).check();
    return;
  }
  if (f.type === 'checkbox') {
    const answer = value.trim().toLowerCase();
    if (/^(yes|true|checked|on|1)$/.test(answer)) await loc.setChecked(true);
    else if (/^(no|false|unchecked|off|0)$/.test(answer)) await loc.setChecked(false);
    else throw new Error('Confirm this checkbox in the browser');
    return;
  }
  if (f.type === 'select') {
    await loc.selectOption({ label: value });
    return;
  }
  if (value) {
    const role = await loc.getAttribute('role');
    const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
    if (role === 'combobox' && tag !== 'input' && tag !== 'textarea') {
      await loc.click();
      const option = frame.getByRole('option', { name: value, exact: true }).first();
      await option.waitFor({ state: 'visible', timeout: 3000 });
      await option.click();
    } else {
      await loc.fill(value);
      if (role === 'combobox') {
        const option = frame.getByRole('option', { name: value, exact: true }).first();
        await option.waitFor({ state: 'visible', timeout: 3000 });
        await option.click();
      }
    }
  }
}
async function snapshot(page: Page, fields: Field[]) {
  const reviewText = fields.length ? '' : await pageFingerprint(page);
  const content = fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    required: f.required,
    value: f.value,
  }));
  const url = page.url();
  const retainedValues = [];
  for (const frame of page.frames()) {
    try {
      retainedValues.push(
        await frame.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLInputElement>('[data-aj-field],[data-aj-radio]'),
          ).map((el) => ({
            id: el.getAttribute('data-aj-field') || el.getAttribute('data-aj-radio'),
            value: el.value,
            checked: el.checked,
          })),
        ),
      );
    } catch {}
  }
  return hash(JSON.stringify({ url, content, reviewText, retainedValues }));
}
async function screenshot(aid: string, page: Page) {
  await page
    .screenshot({
      path: path.join(dataDir, 'receipts', `${aid}.png`),
      fullPage: true,
      timeout: 15000,
    })
    .then(() => {
      const u = new URL(page.url());
      update(aid, { screenshotAt: now(), browserPage: u.origin + u.pathname });
    })
    .catch(() => {});
}
async function challenge(page: Page) {
  const password = page.locator('input[type=password]').first();
  if ((await password.count()) && (await password.isVisible())) return true;
  const text = (await page.locator('body').innerText()).slice(0, 25000);
  if (
    /verify you are human|complete the captcha|security verification|two.factor authentication|enter.*verification code|sign in to your account|select a method below to sign in|sign in using (?:microsoft|google|linkedin|facebook)|sign in or create an account/i.test(
      text,
    )
  )
    return true;
  const frames = page.frames().filter((f) => /recaptcha.*bframe|hcaptcha.*challenge/.test(f.url()));
  return frames.length > 0;
}
async function finalButton(page: Page) {
  return findButton(page, 'submit');
}
export async function processApplication(aid: string) {
  return withApplicationLock(aid, () => processApplicationLocked(aid));
}
async function processApplicationLocked(aid: string) {
  checkRunning();
  let a = application(aid)!;
  const p = profile();
  if (!p.confirmed || !p.name || !p.email) {
    update(aid, {
      stage: 'needs_user',
      message: 'Complete and confirm your profile before applying.',
    });
    return;
  }
  try {
    if (!a.job.practice && !hasSession(aid)) {
      const checked = await checkActive(a.job);
      if (checked.status === 'closed') {
        update(aid, { stage: 'skipped', message: 'This job is no longer accepting applications.' });
        return;
      }
    }
    if (!a.packet || a.profileVersion !== p.version) {
      update(aid, { stage: 'preparing', message: 'Preparing your application documents…' });
      const packet = await preparePacket(p, a.job);
      await renderPacket(aid, packet);
      update(aid, { packet, profileVersion: p.version, profileSnapshot: p });
    }
    a = application(aid)!;
    update(aid, {
      stage: 'filling',
      message: 'Opening the application and matching your confirmed answers…',
      attempts: a.attempts + 1,
    });
    if (!a.job.practice && new URL(a.job.url).protocol !== 'https:')
      throw new Error('Use the employer’s HTTPS job URL before filling your personal information.');
    const browser = browserPlan(settings().browser);
    if (
      !hasSession(aid) &&
      browser.mode === 'external' &&
      process.env.APPLY_JOBS_HEADLESS !== '1' &&
      !process.env.APPLY_JOBS_CHROME
    ) {
      await openSystemBrowser(a.job.url);
      update(aid, {
        stage: 'needs_user',
        message: `Opened in ${browser.systemName}, your default browser. Automatic filling is unavailable in this browser. Select Chrome, Edge or the built-in browser in Settings to continue automatically.`,
        fields: [],
      });
      return;
    }
    const { page } = await openSession(a);
    if (adapterFor(page.url()).mode === 'capture') {
      if (!(await enterApplication(page))) {
        update(aid, {
          stage: 'needs_user',
          message:
            'This board needs a manual handoff. Follow the employer application link in the browser or capture that link with the extension, then Resume.',
        });
        return;
      }
    }
    if (a.packet?.coverLetter && a.packet.coverLetterConfirmed)
      await renderPDF(aid + '-cover', p.name + '\n\n' + a.packet.coverLetter);
    for (let step = 0; step < 16; step++) {
      checkRunning();
      if (await challenge(page)) {
        update(aid, {
          stage: 'needs_user',
          message:
            'Waiting for employer sign-in or verification. I’ll continue automatically when it is complete.',
        });
        await watchBrowser(aid, page, 'authentication');
        await screenshot(aid, page);
        return;
      }
      const seen = await inspect(page);
      update(aid, {
        message: seen.length
          ? `Matching and filling ${seen.length} application fields…`
          : 'Looking for the employer application form…',
      });
      const previous = application(aid)!.fields;
      const fields: Field[] = [];
      for (const f of seen) {
        const prior = previous.find(
          (x) =>
            x.label === f.label &&
            (x.occurrence || 0) === (f.occurrence || 0) &&
            x.type === f.type &&
            x.source === 'Your answer',
        );
        const answer = prior
          ? { answer: prior.answer, source: prior.source, resolved: true }
          : /cover.?letter/i.test(f.label) && a.packet?.coverLetterConfirmed && a.packet.coverLetter
            ? {
                answer: f.type === 'file' ? 'Approved cover letter' : a.packet.coverLetter,
                source: 'Approved cover letter',
                resolved: true,
              }
            : answerField(f, p);
        Object.assign(f, answer);
        if (answer.answer) {
          try {
            await fillFormField(page, f, answer.answer, aid);
            f.value = answer.answer;
          } catch {
            f.resolved = false;
            f.source = 'Check in browser';
          }
        } else if (f.required && f.value && f.type !== 'checkbox') {
          f.answer = f.value;
          f.source = 'Browser value';
          f.resolved = true;
        }
        fields.push(f);
      }
      if (!fields.length) {
        if (previous.length && (await finalButton(page))) {
          fields.push(...previous);
        } else {
          update(aid, {
            message: 'Waiting for the employer page and opening the application form…',
          });
          const result = await reachApplication(page, {
            ready: async () => (await inspect(page)).length > 0,
            blocked: () => challenge(page),
            checkRunning,
          });
          if (result === 'ready') continue;
          if (result === 'blocked') {
            update(aid, {
              stage: 'needs_user',
              message:
                'The employer requires sign-in or verification. Complete it in the browser; I’ll continue automatically.',
            });
            await watchBrowser(aid, page, 'authentication');
            await screenshot(aid, page);
            return;
          }
        }
        if (!fields.length) {
          update(aid, {
            stage: 'needs_user',
            fields: [],
            message:
              'The employer form did not become available after waiting and trying its Apply links. Check the browser for an unavailable listing or an unsupported application step, then choose Resume.',
          });
          await watchBrowser(aid, page, 'page');
          await screenshot(aid, page);
          return;
        }
      }
      // Read native validation after React/blur handlers, rather than assuming fill succeeded.
      await page
        .evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        .catch(() => {});
      for (const problem of await formProblems(page)) {
        const field = fields.find((f) => f.id === problem.id);
        if (field) {
          field.resolved = false;
          field.required = true;
          field.source = problem.message;
        }
      }
      const missing = fields.filter((f) => f.required && !f.resolved);
      await screenshot(aid, page);
      if (missing.length) {
        update(aid, {
          fields,
          stage: 'needs_user',
          message: `${missing.length} required ${missing.length === 1 ? 'answer needs' : 'answers need'} your attention.`,
          snapshotHash: '',
        });
        return;
      }
      const submit = await finalButton(page);
      if (submit) {
        const current = await inspect(page);
        const merged = fields.map((f) => ({
          ...f,
          value: current.find((c) => c.id === f.id)?.value || f.value,
        }));
        const snapshotHash = await snapshot(page, current);
        update(aid, {
          stage: 'review',
          fields: merged,
          message:
            a.packet?.requiresReview && !a.packet.approved
              ? 'The form is ready. AI résumé edits are available in Documents; final approval includes the résumé and answers.'
              : 'All recognized steps are complete. Review the answers, then click Approve & submit application.',
          snapshotHash,
          profileVersion: p.version,
          revision: application(aid)!.revision + 1,
        });
        event('Application is ready for final review', 'success', aid);
        if (
          settings().autopilot &&
          !a.job.practice &&
          !settings().paused &&
          eligible(a.job, settings()) &&
          matches(a.job, settings()) &&
          adapterFor(page.url()).mode === 'automatic' &&
          (!application(aid)!.packet?.coverLetter ||
            !!application(aid)!.packet?.coverLetterConfirmed) &&
          fields.every((f) => !f.required || f.resolved) &&
          !fields.some((f) => f.source === 'Browser value')
        )
          await submitApplicationLocked(aid, snapshotHash);
        return;
      }
      const next = await findButton(page, 'next');
      if (next) {
        checkRunning();
        update(aid, {
          fields,
          message: 'Answers filled. Continuing to the next application step…',
        });
        const stepUrl = page.url();
        if (await advancePage(page, next)) {
          const completed = application(aid)!.completedSteps || [];
          const signature = (items: Field[]) =>
            JSON.stringify(items.map((f) => [f.label, f.value]));
          if (
            !completed.some((s) => s.url === stepUrl && signature(s.fields) === signature(fields))
          )
            completed.push({ url: stepUrl, fields });
          update(aid, { completedSteps: completed, fields });
          continue;
        }
        update(aid, {
          stage: 'needs_user',
          fields,
          snapshotHash: '',
          message:
            'The Next button did not advance the form. Check the browser for validation messages or a required selection, then Resume.',
        });
        await screenshot(aid, page);
        return;
      }
      const disabledAction =
        (await findButton(page, 'submit', true)) || (await findButton(page, 'next', true));
      update(aid, {
        stage: 'needs_user',
        fields,
        message: disabledAction
          ? 'Waiting for the employer’s action button to become available. Upload processing or validation may still be running.'
          : 'No supported Continue or Submit action is visible. Watching for the employer page to change.',
      });
      await watchBrowser(aid, page, 'page');
      await screenshot(aid, page);
      return;
    }
    update(aid, {
      stage: 'needs_user',
      message: 'Several form steps completed. Review the current page and choose Resume.',
    });
  } catch (e) {
    update(aid, {
      stage: 'needs_user',
      error: (e as Error).message,
      message: (e as Error).message,
    });
    event((e as Error).message, 'warning', aid);
  }
}
export async function submitApplication(aid: string, approvedHash: string) {
  return withApplicationLock(aid, () => submitApplicationLocked(aid, approvedHash));
}
async function submitApplicationLocked(aid: string, approvedHash: string) {
  checkRunning();
  const a = application(aid);
  if (!a || a.stage !== 'review') throw new Error('This application is not ready for submission');
  if (a.profileVersion !== profile().version)
    throw new Error('Your profile changed. Resume and review the application again.');
  if (!approvedHash || a.snapshotHash !== approvedHash)
    throw new Error('Review is out of date. Refresh the application.');
  const session = sessions.get(aid);
  if (!session) throw new Error('Browser session ended. Resume the application first.');
  const current = await inspect(session.page);
  if ((await snapshot(session.page, current)) !== approvedHash)
    throw new Error('The form changed in the browser. Resume and review it again.');
  const button = await finalButton(session.page);
  if (!button) throw new Error('Submit button not found. Continue in the browser.');
  const invalid = await formProblems(session.page);
  if (invalid.length)
    throw new Error('The employer form still has validation errors. Resume to review them.');
  const beforeText = await session.page.locator('body').innerText();
  if (a.profileVersion !== profile().version)
    throw new Error('Your profile changed during review. Resume and review the application again.');
  const intentHash = hash(
    JSON.stringify({ aid, approvedHash, profileVersion: a.profileVersion, at: now() }),
  );
  update(aid, {
    stage: 'submitting',
    submissionIntent: {
      hash: intentHash,
      formHash: approvedHash,
      createdAt: now(),
      profileVersion: a.profileVersion,
    },
    message: 'Submitting to the employer…',
  });
  event('Submission intent recorded', 'info', aid);
  try {
    checkRunning();
    await button.click({ timeout: 15000 });
    const successPattern =
      /thank you for (?:applying|your application|your interest)|application (?:has been |was )?(?:submitted|received)|successfully (?:submitted|applied)|we(?:’|')ve received your application/i;
    let body = '';
    for (let i = 0; i < 60; i++) {
      await session.page.waitForTimeout(250);
      body = await session.page
        .locator('body')
        .innerText()
        .catch(() => '');
      if (successPattern.test(body) && body !== beforeText) break;
      const invalidAfter = await formProblems(session.page);
      if (invalidAfter.length) {
        update(aid, {
          stage: 'needs_user',
          snapshotHash: '',
          message:
            'The employer rejected one or more fields. Correct the validation messages in the browser and Resume.',
        });
        await screenshot(aid, session.page);
        return;
      }
    }
    const confirm = body.match(
      /(?:thank you for (?:applying|your (?:application|interest))|application (?:has been |was )?(?:submitted|received)|successfully (?:submitted|applied)|we(?:’|')ve received your application)[^\n]{0,220}/i,
    );
    await screenshot(aid, session.page);
    if (!confirm || beforeText.includes(confirm[0])) {
      update(aid, {
        stage: 'unknown',
        message:
          'Submit was clicked, but confirmation was not detected. Check the browser before marking the result.',
      });
      event('Submission outcome needs confirmation', 'warning', aid);
      return;
    }
    const receipt: Receipt = {
      submittedAt: now(),
      url: session.page.url(),
      confirmation: confirm[0],
      fields: [
        ...(a.completedSteps || []).flatMap((s, i) =>
          s.fields.map((f) => ({ ...f, label: `Step ${i + 1}: ${f.label}` })),
        ),
        ...current,
      ].map((f) => ({
        label: f.label,
        value: f.type === 'file' ? f.value.replace(/^.*[\\/]/, '') : f.value,
      })),
      resumeHash: await fileHash(path.join(dataDir, 'documents', `${aid}.pdf`)),
      intentHash,
      practice: a.job.practice,
    };
    await saveReceipt(aid, receipt);
    update(aid, {
      stage: 'submitted',
      receipt,
      message: a.job.practice
        ? 'Practice complete. Nothing was sent to an employer.'
        : 'Application submitted and confirmation saved.',
    });
    event(
      a.job.practice ? 'Practice application completed' : `Applied to ${a.job.company}`,
      'success',
      aid,
    );
    await closeSession(aid);
  } catch (e) {
    update(aid, {
      stage: 'unknown',
      error: (e as Error).message,
      message:
        'Submission may have reached the employer. Confirm the result before doing anything else.',
    });
    throw e;
  }
}
export async function applyAnswers(
  aid: string,
  answers: { id: string; value: string; save: boolean }[],
) {
  return withApplicationLock(aid, () => applyAnswersLocked(aid, answers));
}
async function applyAnswersLocked(
  aid: string,
  answers: { id: string; value: string; save: boolean }[],
) {
  const a = application(aid);
  const s = sessions.get(aid);
  if (!a || !s) throw new Error('Resume the browser session before editing answers');
  checkRunning();
  const p = profile();
  for (const item of answers) {
    const f = a.fields.find((f) => f.id === item.id);
    if (!f) throw new Error('Unknown form field');
    if (f.type === 'file') continue;
    await fillFormField(s.page, f, item.value, aid);
    f.answer = item.value;
    f.value = item.value;
    f.resolved = !!item.value || !f.required;
    f.source = 'Your answer';
    if (item.save) {
      p.answers = p.answers.filter((x) => normalize(x.question) !== normalize(f.label));
      p.answers.push({ question: f.label, answer: item.value });
    }
  }
  saveProfileAnswers(
    p,
    answers.some((x) => x.save),
  );
  update(aid, {
    fields: a.fields,
    snapshotHash: '',
    stage: 'needs_user',
    message: 'Answers saved. Resume to validate the form.',
  });
}
import { setKV } from './store.ts';
function saveProfileAnswers(p: ReturnType<typeof profile>, save: boolean) {
  if (save) {
    // Saved question answers do not change the résumé facts or invalidate its approval.
    setKV('profile', p);
  }
}
export async function enqueueTick() {
  if (busy || settings().paused) return;
  if (sessions.size) {
    for (const [aid, session] of sessions) {
      const a = application(aid);
      if (a?.stage !== 'needs_user' || !a.waitingFor || applicationLocks.has(aid)) continue;
      busy = true;
      try {
        if (!a.screenshotAt || Date.now() - Date.parse(a.screenshotAt) >= 15000)
          await screenshot(aid, session.page);
        const previous = browserWaits.get(aid);
        const fingerprint = await pageFingerprint(session.page);
        const blocked = await challenge(session.page);
        const ready =
          a.waitingFor === 'authentication'
            ? !blocked &&
              ((await inspect(session.page)).length > 0 ||
                !!(await findButton(session.page, 'apply')))
            : !blocked && !!previous && previous.fingerprint !== fingerprint;
        if (ready && (previous?.retries || 0) >= 3) {
          update(aid, {
            waitingFor: undefined,
            message:
              'Automatic retries could not finish this employer step. Check the browser for the specific requirement, then Resume.',
          });
        } else if (ready) {
          browserWaits.set(aid, { fingerprint, retries: (previous?.retries || 0) + 1 });
          update(aid, { message: 'The employer page is ready. Continuing automatically…' });
          await processApplication(aid);
        }
      } catch (e) {
        event('Browser monitoring stopped: ' + (e as Error).message, 'warning', aid);
        update(aid, { waitingFor: undefined });
      } finally {
        busy = false;
      }
    }
    return;
  }
  const a = applications()
    .reverse()
    .find((a) => a.stage === 'queued');
  if (!a) return;
  busy = true;
  try {
    await processApplication(a.id);
  } finally {
    busy = false;
  }
}
export function startApplication(aid: string) {
  checkRunning();
  const p = profile();
  if (!p.confirmed || !p.name || !p.email)
    throw new Error(
      'Review and confirm your profile in My profile before starting this application.',
    );
  if (busy || applicationLocks.has(aid))
    throw new Error('Another browser operation is still running. Wait for it to finish.');
  if (sessions.size && !sessions.has(aid))
    throw new Error('Close the other application browser before starting this one.');
  browserWaits.delete(aid);
  busy = true;
  update(aid, {
    stage: 'preparing',
    error: '',
    message: 'Preparing your saved résumé mode and opening the application…',
  });
  void processApplication(aid)
    .catch((e) => {
      update(aid, { stage: 'needs_user', message: e.message, error: e.message });
      event(e.message, 'warning', aid);
    })
    .finally(() => {
      busy = false;
    });
}
export async function exclusiveProcess(aid: string) {
  if (busy) throw new Error('A browser operation is already running');
  busy = true;
  try {
    await processApplication(aid);
  } finally {
    busy = false;
  }
}
export async function shutdownBrowsers() {
  for (const id of sessions.keys()) await closeSession(id);
}

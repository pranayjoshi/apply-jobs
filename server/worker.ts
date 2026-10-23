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
import { adapterFor, findButton, enterApplication, adapters } from './adapters.ts';
import { answerField } from './answers.ts';
import { publicURL } from './network.ts';
import { renderPDF, hash, fileHash, saveReceipt } from './documents.ts';
import { preparePacket } from './llm.ts';
const sessions = new Map<string, { context: BrowserContext; page: Page }>();
let busy = false;
const browserOptions = () => ({
  headless: settings().headless || process.env.APPLY_JOBS_HEADLESS === '1',
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
    await s.context.close().catch(() => {});
  }
}
async function openSession(a: Application) {
  if (sessions.has(a.id)) return sessions.get(a.id)!;
  if (sessions.size) throw new Error('Finish or close the current browser session first');
  const context = await chromium.launchPersistentContext(
    path.join(dataDir, 'browser', 'candidate'),
    {
      ...browserOptions(),
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
      serviceWorkers: 'block',
    },
  );
  const practiceOrigin = `http://127.0.0.1:${process.env.PORT || 4318}`;
  await context.route('**/*', async (route) => {
    const u = route.request().url();
    try {
      if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      if (a.job.practice && new URL(u).origin === practiceOrigin) return route.continue();
      await publicURL(u);
      await route.continue();
    } catch {
      await route.abort();
    }
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(7000);
  sessions.set(a.id, { context, page });
  try {
    await page.goto(a.job.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    return { context, page };
  } catch (e) {
    await closeSession(a.id);
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
      const radioDone = new Set<string>();
      for (const [i, el] of elements.entries()) {
        const type = el.getAttribute('type') || el.tagName.toLowerCase();
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
          const name = el.getAttribute('name') || el.id;
          if (radioDone.has(name)) continue;
          radioDone.add(name);
          group = elements.filter(
            (x) => x.getAttribute('type') === 'radio' && x.getAttribute('name') === name,
          ) as HTMLInputElement[];
          label =
            el.closest('fieldset')?.querySelector('legend')?.textContent ||
            el.closest('[role="radiogroup"]')?.getAttribute('aria-label') ||
            name;
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
  const result: Field[] = [];
  for (const [i, frame] of page.frames().entries()) {
    try {
      result.push(...(await inspectFormFrame(frame, i)));
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
    await loc.setChecked(/^(yes|true|checked|on)$/i.test(value));
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
  const content = fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    required: f.required,
    value: f.value,
  }));
  const url = page.url();
  return hash(JSON.stringify({ url, content }));
}
async function screenshot(aid: string, page: Page) {
  await page
    .screenshot({
      path: path.join(dataDir, 'receipts', `${aid}.png`),
      fullPage: true,
      timeout: 15000,
    })
    .catch(() => {});
}
async function challenge(page: Page) {
  const password = page.locator('input[type=password]').first();
  if ((await password.count()) && (await password.isVisible())) return true;
  const text = (await page.locator('body').innerText()).slice(0, 25000);
  if (
    /verify you are human|complete the captcha|security verification|two.factor authentication|enter.*verification code|sign in to your account/i.test(
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
      const packet = await preparePacket(p, a.job, false);
      await renderPDF(aid, packet.resumeText);
      update(aid, { packet, profileVersion: p.version, profileSnapshot: p });
    }
    a = application(aid)!;
    update(aid, {
      stage: 'filling',
      message: 'Opening the application and matching your confirmed answers…',
      attempts: a.attempts + 1,
    });
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
    for (let step = 0; step < 8; step++) {
      checkRunning();
      if (await challenge(page)) {
        update(aid, {
          stage: 'needs_user',
          message: 'Complete the login or verification in the browser, then choose Resume.',
        });
        await screenshot(aid, page);
        return;
      }
      const seen = await inspect(page);
      const previous = application(aid)!.fields;
      const fields: Field[] = [];
      for (const f of seen) {
        const prior = previous.find((x) => x.label === f.label && x.source === 'Your answer');
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
        if (await enterApplication(page)) {
          await page.waitForTimeout(600);
          continue;
        }
        update(aid, {
          stage: 'needs_user',
          fields: [],
          message: 'Open the application form in the browser, then Resume.',
        });
        return;
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
          message: 'Your form is ready. Review every answer before submitting.',
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
          !application(aid)!.packet?.coverLetter &&
          fields.every((f) => !f.required || f.resolved) &&
          !fields.some((f) => f.source === 'Browser value')
        )
          await submitApplication(aid, snapshotHash);
        return;
      }
      const next = await findButton(page, 'next');
      if (next) {
        checkRunning();
        await next.click();
        await page.waitForTimeout(800);
        continue;
      }
      update(aid, {
        stage: 'needs_user',
        fields,
        message: 'This page needs a manual step. Continue in the browser, then choose Resume.',
      });
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
  const beforeText = await session.page.locator('body').innerText();
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
    await session.page.waitForTimeout(1800);
    const body = await session.page.locator('body').innerText();
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
      fields: current.map((f) => ({
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
      p.answers = p.answers.filter((x) => x.question !== f.label);
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
    p.version++;
    setKV('profile', p);
  }
}
export async function enqueueTick() {
  if (busy || settings().paused || sessions.size) return;
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

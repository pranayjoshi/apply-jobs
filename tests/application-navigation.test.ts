import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { reachApplication } from '../server/adapters.ts';
test('delayed Apply links and application choices proceed automatically without submitting', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://navigation.example/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<main id="root">Loading…</main>`,
      }),
    );
    await page.goto('https://navigation.example/job');
    // Add a delayed client-rendered entry control with a normal application form.
    await page.evaluate(() => {
      setTimeout(() => {
        const root = document.querySelector('main')!;
        root.innerHTML = '<button id="entry">Apply now</button>';
        document.getElementById('entry')!.onclick = () => {
          root.innerHTML = '<input aria-label="Email"><button id="submit">Apply</button>';
          document.getElementById('submit')!.onclick = () => {
            (window as any).submitted = true;
          };
        };
      }, 1500);
    });
    let checks = 0;
    assert.equal(
      await reachApplication(page, {
        ready: async () => (await page.getByRole('textbox').count()) > 0,
        blocked: async () => false,
        checkRunning: () => {
          checks++;
        },
        timeoutMs: 8000,
      }),
      'ready',
    );
    assert.ok(checks > 1);
    assert.equal(await page.evaluate(() => (window as any).submitted), undefined);
  } finally {
    await browser.close();
  }
});
test('navigation pauses at authentication and respects global pause', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main>Sign in using Microsoft</main>');
    assert.equal(
      await reachApplication(page, {
        ready: async () => false,
        blocked: async () => true,
        checkRunning: () => {},
      }),
      'blocked',
    );
    await assert.rejects(
      reachApplication(page, {
        ready: async () => false,
        blocked: async () => false,
        checkRunning: () => {
          throw new Error('Paused');
        },
      }),
      /Paused/,
    );
  } finally {
    await browser.close();
  }
});

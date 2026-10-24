import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.APPLY_JOBS_DATA = mkdtempSync(path.join(tmpdir(), 'apply-jobs-strategy-'));
const store = await import('../server/store.ts');
const { preparePacket, facts } = await import('../server/llm.ts');
const { renderPDF, renderPacket, fileHash } = await import('../server/documents.ts');
import type { Job } from '../src/types.ts';
test('three profile strategies preserve original PDFs and admit only reviewed, grounded résumé edits', async () => {
  const profile = {
    ...store.blankProfile,
    name: 'Alex Example',
    experience:
      'Example Co · Engineer · 2022–2025\nBuilt accessible interfaces using React.\nReduced loading time by 20%.',
    education: 'Example University · BS Computer Science · 2021',
    skills: 'React, TypeScript',
    resumeText: 'Alex Example\nOriginal résumé content.',
    resumeFile: 'source.pdf',
    confirmed: true,
  };
  const job = {
    title: 'Frontend Engineer',
    description: 'Build accessible React interfaces.',
    company: 'Example',
  } as Job;
  await renderPDF('source', profile.resumeText);
  const original = await preparePacket(profile, job);
  assert.equal(original.mode, 'original');
  await renderPacket('copy', original);
  assert.equal(
    await fileHash(path.join(store.dataDir, 'documents/source.pdf')),
    await fileHash(path.join(store.dataDir, 'documents/copy.pdf')),
  );
  store.setKV('settings', {
    ...store.settings(),
    provider: 'ollama',
    model: 'fixture',
    baseUrl: 'http://localhost:11434',
  });
  const originalFetch = globalThis.fetch;
  const source = facts(profile);
  const bullet = source.find((f) => f.text === 'Built accessible interfaces using React.')!;
  const metric = source.find((f) => f.text.includes('20%'))!;
  const education = source.find((f) => f.id.startsWith('s2_'))!;
  globalThis.fetch = (async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    const verifying = body.messages[0].content.includes('Verify résumé edits');
    return Response.json({
      message: {
        content: JSON.stringify(
          verifying
            ? { supportedIds: [bullet.id, metric.id, education.id] }
            : {
                selectedFactIds: source.map((f) => f.id),
                rewrittenFacts: [
                  { id: bullet.id, text: 'Built accessible React interfaces.' },
                  { id: metric.id, text: 'Reduced loading time by 99%.' },
                  { id: education.id, text: 'Example University · PhD Computer Science · 2021' },
                ],
              },
        ),
      },
    });
  }) as typeof fetch;
  try {
    for (const mode of ['tailored', 'maximize'] as const) {
      const packet = await preparePacket({ ...profile, resumeMode: mode }, job);
      assert.equal(packet.mode, mode);
      assert.equal(packet.originalFile, undefined);
      assert.equal(packet.requiresReview, true);
      assert.equal(packet.approved, false);
      assert.equal(packet.factEdits?.length, 1);
      assert.match(packet.resumeText, /Built accessible React interfaces/);
      assert.match(packet.resumeText, /20%/);
      assert(!packet.resumeText.includes('99%'));
      assert(!packet.resumeText.includes('PhD'));
      assert.match(packet.resumeText, /BS Computer Science/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

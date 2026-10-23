import path from 'node:path';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { dataDir } from './store.ts';
export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export async function renderPDF(aid: string, text: string) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.APPLY_JOBS_CHROME ? { executablePath: process.env.APPLY_JOBS_CHROME } : {}),
  });
  try {
    const page = await browser.newPage();
    const lines = text.split('\n');
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:Letter;margin:0.7in}body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.5;color:#182328}h1{font-size:23pt;margin:0 0 8px}h2{font-size:11pt;margin:18px 0 8px;border-bottom:1px solid #dce2de;padding-bottom:4px;letter-spacing:.5px}p{margin:0 0 5px;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>${escapeHTML(lines.shift() || 'Résumé')}</h1>${lines.map((l) => (/^(PROFESSIONAL SUMMARY|EXPERIENCE|EDUCATION|SKILLS)$/.test(l) ? `<h2>${escapeHTML(l)}</h2>` : `<p>${escapeHTML(l) || '&nbsp;'}</p>`)).join('')}</body></html>`,
    );
    const file = path.join(dataDir, 'documents', `${aid}.pdf`);
    await page.pdf({ path: file, printBackground: true });
    return file;
  } finally {
    await browser.close();
  }
}
export async function textFromPDF(buffer: Buffer) {
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdf.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const doc = await loading.promise;
  try {
    const lines: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
      const page = await doc.getPage(i);
      const text = await page.getTextContent();
      lines.push(text.items.map((x: any) => x.str || '').join(' '));
    }
    return lines.join('\n\n');
  } finally {
    await loading.destroy();
  }
}
export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export async function fileHash(file: string) {
  return hash(await readFile(file));
}
export async function saveReceipt(aid: string, data: unknown) {
  await writeFile(path.join(dataDir, 'receipts', `${aid}.json`), JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

export async function ocrImage(buffer: Buffer) {
  const { createWorker } = await import('tesseract.js');
  const cache = path.join(dataDir, 'ocr-cache');
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const worker = await createWorker('eng', 1, { cachePath: cache });
  try {
    const result = await worker.recognize(buffer);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
export async function ocrPDF(buffer: Buffer) {
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const loading = pdf.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const doc = await loading.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
      const page = await doc.getPage(i),
        viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        viewport,
        canvas: canvas as any,
        canvasContext: canvas.getContext('2d') as any,
      }).promise;
      pages.push(await ocrImage(canvas.toBuffer('image/png')));
    }
    return pages.join('\n\n');
  } finally {
    await loading.destroy();
  }
}

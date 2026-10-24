import path from 'node:path';
import { writeFile, readFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { dataDir } from './store.ts';
import type { Packet } from '../src/types.ts';
export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function resumeHTML(text: string) {
  const lines = text.split('\n');
  const name = lines.shift() || 'Résumé';
  const heading =
    /^(?:PROFESSIONAL SUMMARY|SUMMARY|PROFILE|EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EDUCATION|SKILLS|TECHNICAL SKILLS|PROJECTS|SELECTED PROJECTS|CERTIFICATIONS|AWARDS)$/i;
  let inHeader = true,
    inSection = false,
    sectionName = '';
  const content = lines
    .map((raw) => {
      const line = raw.trim();
      if (!line) return '';
      if (heading.test(line)) {
        inHeader = false;
        inSection = true;
        sectionName = line.toUpperCase();
        return `<h2>${escapeHTML(line)}</h2>`;
      }
      if (inHeader) return `<div class="contact">${escapeHTML(line)}</div>`;
      const pieces = line.split(/\s+[·|]\s+/);
      const last = pieces[pieces.length - 1];
      if (pieces.length > 1) {
        const dated = /(?:19|20)\d{2}|present|current/i.test(last);
        return `<div class="entry"><div><strong>${escapeHTML(pieces[0])}</strong>${pieces.length > (dated ? 2 : 1) ? `<span class="sub">${escapeHTML(pieces.slice(1, dated ? -1 : undefined).join(' · '))}</span>` : ''}</div>${dated ? `<span class="dates">${escapeHTML(last)}</span>` : ''}</div>`;
      }
      if (/SUMMARY|PROFILE/.test(sectionName)) return `<p>${escapeHTML(line)}</p>`;
      if (/SKILLS/.test(sectionName)) {
        const colon = line.indexOf(':');
        return colon > 0
          ? `<p><strong>${escapeHTML(line.slice(0, colon + 1))}</strong>${escapeHTML(line.slice(colon + 1))}</p>`
          : `<p>${escapeHTML(line)}</p>`;
      }
      if (inSection) return `<p class="bullet">• ${escapeHTML(line.replace(/^[•●▪*]\s*/, ''))}</p>`;
      return `<p>${escapeHTML(line)}</p>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:Letter;margin:.48in .55in}*{box-sizing:border-box}body{font-family:"Times New Roman",Times,serif;font-size:10.5pt;line-height:1.17;color:#000;margin:0}h1{text-align:center;font-size:25pt;font-variant:normal;margin:0 0 4pt;font-weight:700}.contact{text-align:center;font-size:10pt;line-height:1.3;overflow-wrap:anywhere}h2{font-size:12pt;font-variant:small-caps;font-weight:400;border-bottom:.7pt solid #000;margin:11pt 0 5pt;padding-bottom:2pt;break-after:avoid}.entry{display:flex;justify-content:space-between;gap:14pt;margin:5pt 0 2pt;break-after:avoid}.entry>div{flex:1}.sub{display:block;font-size:10pt;font-style:italic}.dates{font-size:10pt;white-space:nowrap}.bullet{margin:2pt 0 2pt 12pt;padding-left:3pt;white-space:pre-wrap;overflow-wrap:anywhere;orphans:2;widows:2}p{margin:3pt 0;white-space:pre-wrap}a{color:inherit}
    </style></head><body><h1>${escapeHTML(name)}</h1>${content}</body></html>`;
}
export async function renderPDF(aid: string, text: string) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.APPLY_JOBS_CHROME ? { executablePath: process.env.APPLY_JOBS_CHROME } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(resumeHTML(text));
    const file = path.join(dataDir, 'documents', `${aid}.pdf`);
    await page.pdf({ path: file, printBackground: true });
    return file;
  } finally {
    await browser.close();
  }
}
export async function renderPacket(aid: string, packet: Packet) {
  if (packet.originalFile) {
    if (
      path.basename(packet.originalFile) !== packet.originalFile ||
      !packet.originalFile.endsWith('.pdf')
    )
      throw new Error('Invalid original résumé file');
    const source = path.join(dataDir, 'documents', packet.originalFile);
    if (!(await readFile(source)).subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('Invalid original PDF');
    await copyFile(source, path.join(dataDir, 'documents', `${aid}.pdf`));
  } else await renderPDF(aid, packet.resumeText);
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
      // Chromium can emit positioned bullets/flex rows after later headings in the PDF stream.
      // Reconstruct visual lines instead of trusting stream order.
      const rows: { y: number; items: any[] }[] = [];
      for (const item of text.items as any[]) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const y = item.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) < 2);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push(item);
      }
      lines.push(
        rows
          .sort((a, b) => b.y - a.y)
          .map((row) => {
            let line = '',
              right: number | undefined;
            for (const item of row.items.sort((a, b) => a.transform[4] - b.transform[4])) {
              const left = item.transform[4];
              if (right !== undefined && left - right > 1 && !line.endsWith(' ')) line += ' ';
              line += item.str;
              right = left + item.width;
            }
            return line.trim();
          })
          .join('\n'),
      );
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

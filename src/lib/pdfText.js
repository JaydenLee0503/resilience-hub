import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    let currentY = null;
    let line = [];

    content.items.forEach((item) => {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (currentY !== null && Math.abs(y - currentY) > 4) {
        lines.push(line.join(' ').replace(/\s+/g, ' ').trim());
        line = [];
      }
      currentY = y;
      if (item.str?.trim()) line.push(item.str.trim());
    });

    if (line.length) lines.push(line.join(' ').replace(/\s+/g, ' ').trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }

  const text = pages.join('\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (text.length < 30) {
    throw new Error('This PDF looks scanned or image-only, so there is no selectable text to extract yet.');
  }
  return text;
}

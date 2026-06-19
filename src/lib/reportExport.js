export function buildReportText(analysis) {
  const lines = ['Beacon Atlas Crisis Report', `Pipeline: ${analysis.pipeline_type ?? 'common'}`, `Urgency: ${analysis.urgency ?? 'medium'}`, '', 'Plain Summary', analysis.plain_language_summary ?? ''];
  appendList(lines, 'What Matters', analysis.what_matters);
  appendList(lines, 'What Happens If Ignored', analysis.what_happens_if_ignored);
  appendList(lines, 'What To Do Next', analysis.what_to_do_next);
  appendList(lines, 'Checklist', (analysis.checklist ?? []).map((item) => `${item.text}${item.deadline ? ` - ${item.deadline}` : ''}`));
  appendList(lines, 'Deadlines', (analysis.deadlines ?? []).map((item) => `${item.date}: ${item.task}${item.consequence ? ` (If missed: ${item.consequence})` : ''}`));
  appendList(lines, 'Who Can Help', (analysis.who_can_help ?? []).map((item) => `${item.name}${item.contact ? ` - ${item.contact}` : ''}${item.note ? ` - ${item.note}` : ''}`));
  appendList(lines, 'Questions To Ask', analysis.questions_to_ask);
  lines.push('', analysis.disclaimer ?? 'Verify all details with a qualified professional before acting.');
  return lines.join('\n');
}

export function downloadTextReport(analysis) {
  downloadBlob('resiliencehub-report.txt', 'text/plain;charset=utf-8', buildReportText(analysis));
}

export function downloadPdfReport(analysis) {
  const text = buildReportText(analysis);
  const pdf = makeSimplePdf(text);
  downloadBlob('resiliencehub-report.pdf', 'application/pdf', pdf);
}

function appendList(lines, title, items = []) {
  if (!items.length) return;
  lines.push('', title);
  items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
}

function downloadBlob(filename, type, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function makeSimplePdf(text) {
  const lines = wrapText(text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-'), 86).slice(0, 56);
  const content = ['BT', '/F1 10 Tf', '50 770 Td', '14 TL', ...lines.map((line, index) => `${index === 0 ? '' : 'T* '}${pdfString(line)} Tj`), 'ET'].join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += `${object}\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: 'application/pdf' });
}

function wrapText(text, max) {
  return text.split('\n').flatMap((paragraph) => {
    const words = paragraph.split(/\s+/);
    const rows = [];
    let row = '';
    for (const word of words) {
      if ((row + ' ' + word).trim().length > max) {
        if (row) rows.push(row);
        row = word;
      } else {
        row = `${row} ${word}`.trim();
      }
    }
    rows.push(row || ' ');
    return rows;
  });
}

function pdfString(value) {
  return `(${value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

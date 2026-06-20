// Clearline — Chrome extension popup.
//
// Two extraction paths, picked automatically:
//   1. PDF tab  → Chrome's native PDF viewer cannot be read by content scripts,
//                 so we fetch the PDF bytes and parse them with a bundled pdf.js.
//   2. Web page → inject a content script and scrape the selectable/visible text.
//
// The extracted text is handed to the local app via URL params; Guardian then
// tokenizes PII in the browser before anything reaches the AI. The extension
// never sends document text anywhere except the local dashboard tab.

import * as pdfjsLib from './vendor/pdf.min.mjs';
import { runGuardian } from './vendor/guardian.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');

// Backend endpoints are configurable on the options page. The defaults point at
// the deployed Supabase Edge Function + Vercel dashboard so the extension works
// with no setup. For local development, override these in the options page with
// http://localhost:3001/api/summarize and http://localhost:5173/.
const DEFAULTS = {
  summarizeUrl: 'https://uzxxjbtiyyxxadzovkqg.supabase.co/functions/v1/analyze',
  appUrl: 'https://resilience-hub-delta.vercel.app/',
  anonKey: '',
};
const MAX_URL_TEXT = 12000;
const MAX_SUMMARY_TEXT = 8000;

async function getSettings() {
  try {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

const sendBtn = document.getElementById('send');
const summarizeBtn = document.getElementById('summarize');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');

sendBtn.addEventListener('click', run);
summarizeBtn.addEventListener('click', summarize);

async function run() {
  sendBtn.disabled = true;
  setStatus('Reading the current tab…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    const { text, source } = await extractFromTab(tab);
    const clean = (text || '').trim();
    if (clean.length < 30) {
      throw new Error('No selectable text was found. Scanned or image-only PDFs have no text to extract yet.');
    }

    const settings = await getSettings();
    await openInApp(clean, source || tab.title || 'Chrome import', settings.appUrl);
    setStatus('Sent to Clearline. Sign in if the dashboard asks.');
  } catch (error) {
    setStatus(error.message || 'Could not send this tab.', true);
  } finally {
    sendBtn.disabled = false;
  }
}

// ── AI summary (Featherless via the local backend) ───────────────────────────

async function summarize() {
  summarizeBtn.disabled = true;
  sendBtn.disabled = true;
  summaryEl.textContent = '';
  setStatus('Reading the current tab…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    const { text } = await extractFromTab(tab);
    const clean = (text || '').trim();
    if (clean.length < 30) {
      throw new Error('No selectable text was found to summarize.');
    }

    // Privacy boundary: tokenize PII on-device before anything leaves the browser.
    const { tokenized, mappingTable } = runGuardian(clean.slice(0, MAX_SUMMARY_TEXT));

    const settings = await getSettings();
    setStatus('Summarizing with AI…');
    const headers = { 'Content-Type': 'application/json' };
    if (settings.anonKey) {
      // Deployed Edge Functions may require the project's (public) anon key.
      headers.apikey = settings.anonKey;
      headers.Authorization = `Bearer ${settings.anonKey}`;
    }
    let res;
    try {
      // Body carries `mode` so the deployed Edge Function can branch; the local
      // dev server routes by path and simply ignores the extra field.
      res = await fetch(settings.summarizeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'summarize', text: tokenized }),
      });
    } catch {
      throw new Error('Could not reach the backend. Check the Summarizer endpoint in the extension options and that the server is running.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Summarizer error (${res.status}).`);
    }
    const { summary } = await res.json();

    // Re-hydrate tokens back to real values — on this device only.
    summaryEl.textContent = rehydrate(summary || '', mappingTable);
    setStatus('Summary ready. Your real values never left this device.');
  } catch (error) {
    setStatus(error.message || 'Could not summarize this tab.', true);
  } finally {
    summarizeBtn.disabled = false;
    sendBtn.disabled = false;
  }
}

// Swap [TOKEN] placeholders back to real values (split/join avoids regex escaping).
function rehydrate(text, mappingTable) {
  let out = String(text || '');
  // Sort by token length descending to avoid substring replacement issues
  const sorted = Array.from(mappingTable).sort((a, b) => b[0].length - a[0].length);
  for (const [token, value] of sorted) out = out.split(token).join(value);
  return out;
}

// ── Routing ──────────────────────────────────────────────────────────────────

async function extractFromTab(tab) {
  const url = tab.url || '';

  // 1. A PDF opened directly in the tab (Chrome's viewer can't be scraped).
  if (looksLikePdf(url)) {
    setStatus('Extracting PDF text…');
    return { text: await extractPdfFromUrl(url), source: titleFromUrl(url, tab.title) };
  }

  // 2. A normal web page — scrape the DOM.
  setStatus('Reading page text…');
  const dom = await extractDomText(tab.id);
  if (dom.text && dom.text.trim().length >= 30) {
    return { text: dom.text, source: dom.title || tab.title };
  }

  // 3. Fallback: the page might be a PDF served without a .pdf URL.
  setStatus('Checking for an embedded PDF…');
  const sniffed = await tryPdfFromUrl(url);
  if (sniffed) return { text: sniffed, source: titleFromUrl(url, tab.title) };

  return { text: dom.text, source: dom.title || tab.title };
}

function looksLikePdf(url) {
  return /\.pdf(\?|#|$)/i.test(url || '');
}

// ── PDF path (bundled pdf.js) ────────────────────────────────────────────────

async function extractPdfFromUrl(url) {
  let bytes;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    if (url.startsWith('file:')) {
      throw new Error('Could not read this local PDF. Enable “Allow access to file URLs” for this extension on chrome://extensions, then try again.');
    }
    throw new Error(`Could not download this PDF (${err.message}).`);
  }
  return extractPdfText(bytes);
}

// Returns extracted text only if the bytes are actually a PDF; otherwise null.
async function tryPdfFromUrl(url) {
  if (!/^https?:|^file:/i.test(url || '')) return null;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const header = String.fromCharCode(...bytes.slice(0, 5));
    if (!header.startsWith('%PDF-')) return null;
    return await extractPdfText(bytes);
  } catch {
    return null;
  }
}

async function extractPdfText(data) {
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
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

  return pages.join('\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

// ── Web page path (content script) ───────────────────────────────────────────

async function extractDomText(tabId) {
  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: extractVisibleText,
    });
  } catch {
    // Restricted pages (chrome://, the Web Store, etc.) reject injection.
    return { title: '', text: '' };
  }
  return mergeFrameResults(injectionResults.map((item) => item.result));
}

function mergeFrameResults(results) {
  const seen = new Set();
  const chunks = [];
  let title = '';

  results.forEach((result) => {
    if (!result) return;
    if (!title && result.title) title = result.title;
    (result.chunks || [result.text]).forEach((chunk) => {
      const normalized = normalizeText(chunk);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        chunks.push(normalized);
      }
    });
  });

  return { title, text: chunks.join('\n\n') };
}

function extractVisibleText() {
  const seen = new Set();
  const chunks = [];

  function normalizeText(value) {
    return String(value || '')
       .replace(/ /g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function visit(root, depth = 0) {
    if (!root || seen.has(root)) return;
    seen.add(root);

    const selection = root.defaultView?.getSelection?.().toString?.()
      || (root.getSelection ? root.getSelection().toString() : '');
    if (selection) chunks.unshift(selection);

    const base = root.body || root;
    collectTextNodes(base);

    root.querySelectorAll?.('[class*="textLayer"], [class*="text-layer"], [role="document"], pdf-viewer, viewer-pdf-page, .page')
      .forEach((node) => {
        if (node.innerText) chunks.push(node.innerText);
        if (node.textContent) chunks.push(node.textContent);
      });

    const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    nodes.forEach((node) => {
      if (node.shadowRoot) visit(node.shadowRoot, depth + 1);
      if (node.tagName === 'IFRAME') {
        try { visit(node.contentDocument, depth + 1); } catch { /* cross-origin */ }
      }
    });
  }

  function collectTextNodes(root) {
    if (!root) return;
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = normalizeText(node.nodeValue || '');
        if (text.length < 2) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_ACCEPT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
        if (style?.display === 'none' || style?.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    if (parts.length) chunks.push(parts.join(' '));
  }

  visit(document);

  return {
    title: document.title || location.href,
    chunks: chunks.map(normalizeText).filter(Boolean),
    text: normalizeText(chunks.join('\n')),
  };
}

// ── Shared helpers (popup context) ───────────────────────────────────────────

async function openInApp(text, source, appUrl) {
  const prefix = text.length > MAX_URL_TEXT
    ? `[Chrome extension note: the document was longer than the transfer limit, so this import contains the first ${MAX_URL_TEXT.toLocaleString()} characters.]\n\n`
    : '';
  const payload = prefix + text.slice(0, MAX_URL_TEXT);

  // Hand the text to the dashboard via the URL *hash fragment* — App.jsx
  // readExtensionImport() reads it from location.hash and strips it on load.
  // The fragment is never sent to the server, so the document text stays out of
  // server logs (a normal web page also cannot read chrome.storage.session).
  const base = (appUrl || DEFAULTS.appUrl).split('#')[0];
  const params = new URLSearchParams({
    extensionText: payload,
    extensionSource: source || 'Chrome import',
  });
  const url = `${base}#${params.toString()}`;
  await chrome.tabs.create({ url });
}

function titleFromUrl(url, fallback) {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last || '') || fallback || 'Chrome PDF import';
  } catch {
    return fallback || 'Chrome PDF import';
  }
}

function normalizeText(value) {
  return String(value || '')
     .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ffb4b4' : '#c4d0ff';
}

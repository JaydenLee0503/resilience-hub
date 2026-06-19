const APP_URL = 'http://localhost:5173/';
const MAX_URL_TEXT = 12000;

document.getElementById('send').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Reading the current tab...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: extractVisibleText,
    });

    const result = mergeFrameResults(injectionResults.map((item) => item.result));
    const text = (result.text || '').trim();
    if (text.length < 30) {
      throw new Error('No selectable PDF/page text was found in the page or PDF viewer. Try selecting/copying a sentence first, then click again.');
    }

    const prefix = text.length > MAX_URL_TEXT
      ? `[Chrome extension note: the document was longer than the transfer limit, so this import contains the first ${MAX_URL_TEXT.toLocaleString()} characters.]\n\n`
      : '';
    const payload = prefix + text.slice(0, MAX_URL_TEXT);
    const source = result?.title || tab.title || 'Chrome PDF import';
    const url = `${APP_URL}?extensionSource=${encodeURIComponent(source)}&extensionText=${encodeURIComponent(payload)}`;

    await chrome.tabs.create({ url });
    status.textContent = 'Sent to Beacon Atlas. Sign in if the dashboard asks.';
  } catch (error) {
    status.textContent = error.message || 'Could not send this tab.';
  }
});

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

  return {
    title,
    text: chunks.join('\n\n'),
  };
}

function extractVisibleText() {
  const seen = new Set();
  const chunks = [];

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
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

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const APP_URL = 'http://localhost:5173/';
const MAX_URL_TEXT = 12000;

document.getElementById('send').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Reading the current tab...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisibleText,
    });

    const text = (result?.text || '').trim();
    if (text.length < 30) {
      throw new Error('No selectable PDF/page text was found. Scanned PDFs need OCR first.');
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

function extractVisibleText() {
  const seen = new Set();
  const chunks = [];

  function visit(root) {
    if (!root || seen.has(root)) return;
    seen.add(root);

    if (root.body?.innerText) chunks.push(root.body.innerText);
    const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    nodes.forEach((node) => {
      if (node.shadowRoot) visit(node.shadowRoot);
      if (node.tagName === 'IFRAME') {
        try { visit(node.contentDocument); } catch { /* cross-origin */ }
      }
    });
  }

  visit(document);
  const selection = window.getSelection?.().toString();
  if (selection) chunks.unshift(selection);

  return {
    title: document.title || location.href,
    text: chunks
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  };
}

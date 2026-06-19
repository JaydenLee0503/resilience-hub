const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GOOGLE_SCRIPT_ID = 'google-identity-services';

export const gmailClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function isGmailConfigured() {
  return Boolean(gmailClientId);
}

export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(script);
  });
}

export async function requestGmailToken() {
  if (!gmailClientId) {
    throw new Error('Add VITE_GOOGLE_CLIENT_ID to .env, restart the app, then connect Gmail.');
  }
  await loadGoogleIdentity();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: gmailClientId,
      scope: GMAIL_SCOPE,
      prompt: 'consent',
      callback: (response) => {
        if (response?.error) reject(new Error(response.error_description || response.error));
        else resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export async function searchGmailMessages(accessToken, query, maxResults = 8) {
  const params = new URLSearchParams({
    q: query || 'newer_than:90d',
    maxResults: String(maxResults),
  });
  const search = await gmailFetch(accessToken, `/messages?${params.toString()}`);
  const messages = search.messages || [];

  return Promise.all(
    messages.map(async (message) => {
      const detail = await gmailFetch(
        accessToken,
        `/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
      );
      return {
        id: detail.id,
        subject: getHeader(detail.payload, 'Subject') || '(No subject)',
        from: getHeader(detail.payload, 'From') || 'Unknown sender',
        date: getHeader(detail.payload, 'Date') || '',
        snippet: detail.snippet || '',
      };
    })
  );
}

export async function getGmailMessageText(accessToken, id) {
  const detail = await gmailFetch(accessToken, `/messages/${id}?format=full`);
  const text = extractPayloadText(detail.payload).trim();
  return {
    id,
    subject: getHeader(detail.payload, 'Subject') || '(No subject)',
    from: getHeader(detail.payload, 'From') || 'Unknown sender',
    date: getHeader(detail.payload, 'Date') || '',
    body: text || detail.snippet || '',
  };
}

async function gmailFetch(accessToken, path) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Gmail request failed (${response.status})`);
  }
  return response.json();
}

function getHeader(payload, name) {
  const header = payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function extractPayloadText(part) {
  if (!part) return '';
  const mime = part.mimeType || '';
  const bodyText = decodeBase64Url(part.body?.data || '');

  if (mime === 'text/plain' && bodyText) return bodyText;
  if (mime === 'text/html' && bodyText) return htmlToText(bodyText);

  return (part.parts || []).map(extractPayloadText).filter(Boolean).join('\n\n');
}

function decodeBase64Url(value) {
  if (!value) return '';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    return decodeURIComponent(
      Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    );
  } catch {
    return atob(padded);
  }
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
  return doc.body.textContent?.replace(/\s{2,}/g, ' ').trim() || '';
}

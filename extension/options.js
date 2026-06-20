// Clearline extension — settings page.
// Stores the backend endpoints in chrome.storage.local so the popup can target
// either the local dev server or a deployed Supabase Edge Function.

const DEFAULTS = {
  summarizeUrl: 'https://uzxxjbtiyyxxadzovkqg.supabase.co/functions/v1/analyze',
  appUrl: 'https://resilience-hub-delta.vercel.app/',
  anonKey: '',
};

const $ = (id) => document.getElementById(id);
const saved = $('saved');

async function load() {
  let stored = {};
  try {
    stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  } catch { /* fall back to defaults */ }
  const settings = { ...DEFAULTS, ...stored };
  $('summarizeUrl').value = settings.summarizeUrl;
  $('appUrl').value = settings.appUrl;
  $('anonKey').value = settings.anonKey;
}

async function save() {
  const settings = {
    summarizeUrl: $('summarizeUrl').value.trim() || DEFAULTS.summarizeUrl,
    appUrl: $('appUrl').value.trim() || DEFAULTS.appUrl,
    anonKey: $('anonKey').value.trim(),
  };
  await chrome.storage.local.set(settings);
  flash('Saved.');
}

async function reset() {
  await chrome.storage.local.set(DEFAULTS);
  await load();
  flash('Reset to defaults.');
}

function flash(message) {
  saved.textContent = message;
  setTimeout(() => { saved.textContent = ''; }, 1800);
}

$('save').addEventListener('click', save);
$('reset').addEventListener('click', reset);
$('preset-prod').addEventListener('click', () => {
  const ref = prompt('Your Supabase project ref (the subdomain of your project URL):');
  if (ref) $('summarizeUrl').value = `https://${ref.trim()}.supabase.co/functions/v1/analyze`;
});

load();

// Clearline extension — settings page.
// Stores the backend endpoints in chrome.storage.local so the popup can target
// either the local dev server or a deployed Supabase Edge Function.

const DEFAULTS = {
  summarizeUrl: 'https://uzxxjbtiyyxxadzovkqg.supabase.co/functions/v1/analyze',
  appUrl: 'https://resilience-hub-delta.vercel.app/',
  anonKey: '',
};

// Values shipped as defaults by older (local-dev) builds. A one-time migration
// clears these so the Options page shows the production defaults. Guarded by a
// flag so a developer can still set localhost afterward without it reverting.
const LEGACY_LOCALHOST = {
  summarizeUrl: 'http://localhost:3001/api/summarize',
  appUrl: 'http://localhost:5173/',
};

async function migrateLegacyDefaults() {
  try {
    const { _migratedToProd } = await chrome.storage.local.get('_migratedToProd');
    if (_migratedToProd) return;
    const stored = await chrome.storage.local.get(Object.keys(LEGACY_LOCALHOST));
    const staleKeys = Object.keys(LEGACY_LOCALHOST).filter((k) => stored[k] === LEGACY_LOCALHOST[k]);
    if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
    await chrome.storage.local.set({ _migratedToProd: true });
  } catch { /* storage unavailable — defaults still apply */ }
}

const $ = (id) => document.getElementById(id);
const saved = $('saved');

async function load() {
  await migrateLegacyDefaults();
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

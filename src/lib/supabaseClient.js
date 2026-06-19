/**
 * supabaseClient.js — single shared Supabase browser client.
 *
 * Reads the public (non-secret) project URL + anon key from VITE_ env vars.
 * The anon key is safe in the browser; Row Level Security (RLS) on every table
 * is what actually protects each user's data (see supabase/migrations).
 *
 * If the env vars are missing, `supabase` is null and the app degrades to its
 * pre-auth behavior instead of crashing.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'Sign-in and saved reports are disabled until you add them to .env.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/**
 * reports.js — saved-analysis data access (the `analyses` table).
 *
 * All calls are owner-scoped automatically by Row Level Security, so these
 * never need to pass a user id for filtering — Postgres enforces it.
 *
 * We persist the RE-HYDRATED analysis (real values), which is the owner's own
 * structured plan. The raw document is never stored (CLAUDE.md §9.6/§9.7).
 */
import { supabase } from './supabaseClient';

/**
 * Save a completed, re-hydrated analysis for the signed-in user.
 * No-op (returns null) if Supabase isn't configured or nobody is signed in.
 *
 * @param {{ source?: string, analysis: object }} input
 * @returns {Promise<object|null>} the inserted row, or null
 */
export async function saveReport({ source, analysis }) {
  if (!supabase || !analysis) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('analyses')
    .insert({
      user_id: user.id,
      source: source ?? null,
      pipeline_type: analysis.pipeline_type ?? 'common',
      urgency: analysis.urgency ?? null,
      analysis,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * List the signed-in user's saved reports, newest first.
 * @returns {Promise<Array>}
 */
export async function listReports() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('analyses')
    .select('id, source, pipeline_type, urgency, analysis, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Permanently delete one report (document + plan are the same row here).
 * @param {string} id
 */
export async function deleteReport(id) {
  if (!supabase) return;
  const { error } = await supabase.from('analyses').delete().eq('id', id);
  if (error) throw error;
}

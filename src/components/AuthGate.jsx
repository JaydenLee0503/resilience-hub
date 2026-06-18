import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * AuthGate — minimal editorial Supabase email/password auth.
 *
 * Navigation after success is driven by the onAuthStateChange listener in
 * App.jsx, so this only triggers the auth call and surfaces errors.
 */
export default function AuthGate({ onBack }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';
  const canContinue =
    email.includes('@') &&
    password.length >= 6 &&
    (!isSignup || name.trim().length >= 2);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canContinue || busy) return;
    setError('');
    setNotice('');

    if (!isSupabaseConfigured) {
      setError('Sign-in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.');
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      // Success with a session → App's auth listener navigates to the dashboard.
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-shell auth-screen">
      <ProductNav onBack={onBack} />

      <main className="auth-screen-body">
        <div className="auth-inner">
          <span className="mono-kicker">Private workspace</span>
          <h1 className="display auth-title">
            {isSignup ? 'Create your account.' : 'Welcome back.'}
          </h1>
          <p className="auth-sub">
            Your analyzed plans live in one private workspace, locked to your account.
            The Guardian tokenizes every document before any AI sees it.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <div className="field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} />
            </div>

            {error && <div className="auth-msg error">{error}</div>}
            {notice && <div className="auth-msg notice">{notice}</div>}

            <button className="submit-btn" disabled={!canContinue || busy}>
              {busy ? 'Working…' : isSignup ? 'Create account →' : 'Sign in →'}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              className="switch-link"
              onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(''); setNotice(''); }}
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

export function ProductNav({ onBack, account, onLogout }) {
  return (
    <nav className="product-nav">
      <button className="ghost-button" onClick={onBack}>← Back</button>
      <div className="product-brand"><span className="brand-pulse" />Beacon Atlas</div>
      {account ? (
        <div className="account-pill"><span>{account.name}</span><button onClick={onLogout}>Sign out</button></div>
      ) : (
        <span className="privacy-pill">Tokenized before any AI sees it</span>
      )}
    </nav>
  );
}

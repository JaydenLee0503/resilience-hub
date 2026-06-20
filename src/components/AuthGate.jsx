import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export default function AuthGate({ onBack }) {
  const [mode, setMode] = useState('signin');
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
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-shell auth-screen">
      <ProductNav onBack={onBack} />

      {/* Animated background blobs */}
      <div className="auth-bg" aria-hidden="true">
        <span className="auth-bg-blob blob-1" />
        <span className="auth-bg-blob blob-2" />
        <span className="auth-bg-blob blob-3" />
        <span className="auth-bg-grid" />
      </div>

      <main className="auth-screen-body">
        <div className="auth-card">

          {/* ── Left: branding ── */}
          <div className="auth-brand-side">
            <p className="auth-kicker">
              <span className="auth-kicker-dot" />
              Private action room
            </p>

            <h1 className="auth-headline">
              {isSignup ? 'Build your atlas.' : 'Welcome back.'}
            </h1>

            <p className="auth-tagline">
              Turn crisis documents, Gmail notices, and PDFs into
              deadline-aware action plans — privately.
            </p>

            <div className="auth-trust">
              <div className="auth-trust-item">
                <span className="auth-trust-dot" />
                On-device Guardian
              </div>
              <div className="auth-trust-item">
                <span className="auth-trust-dot" />
                Tokenized AI requests
              </div>
              <div className="auth-trust-item">
                <span className="auth-trust-dot" />
                Saved to your account
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="auth-divider" aria-hidden="true" />

          {/* ── Right: form ── */}
          <div className="auth-form-side">
            <p className="auth-form-eyebrow">
              {isSignup ? 'New secure workspace' : 'Secure sign in'}
            </p>

            <h2 className="auth-form-title">
              {isSignup ? 'Create Account' : 'Sign In'}
            </h2>

            <form className="auth-form" onSubmit={handleSubmit}>
              {isSignup && (
                <div className="auth-field">
                  <label>Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              )}

              <div className="auth-field">
                <label>Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                />
              </div>

              <div className="auth-field">
                <label>Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  type="password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                />
              </div>

              {error  && <div className="auth-msg auth-msg--error">{error}</div>}
              {notice && <div className="auth-msg auth-msg--notice">{notice}</div>}

              <button className="auth-submit" disabled={!canContinue || busy}>
                <span className="auth-submit-fill" />
                <span className="auth-submit-label">
                  {busy ? 'Working…' : isSignup ? 'Create account →' : 'Sign in →'}
                </span>
              </button>
            </form>

            <p className="auth-switch">
              {isSignup ? 'Already have an account? ' : "Don't have an account? "}
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => {
                  setMode(isSignup ? 'signin' : 'signup');
                  setError('');
                  setNotice('');
                }}
              >
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

export function ProductNav({ onBack, account, onLogout, historyOpen, onToggleHistory }) {
  return (
    <nav className="product-nav">
      <div className="nav-side nav-left">
        {onToggleHistory && (
          <button
            className={`report-nav-btn ${historyOpen ? '' : 'accent'}`}
            onClick={onToggleHistory}
            aria-expanded={historyOpen}
          >
            {historyOpen ? 'Hide history' : 'History'}
          </button>
        )}
        {onBack && (
          <button className="ghost-button" onClick={onBack}>Back</button>
        )}
      </div>

      <div className="product-brand">
        <span className="brand-pulse" />
        Beacon Atlas
      </div>

      <div className="nav-side nav-right">
        {account ? (
          <div className="account-pill">
            <span>{account.name}</span>
            <button onClick={onLogout}>Sign out</button>
          </div>
        ) : (
          <span className="privacy-pill">Tokenized before any AI sees it</span>
        )}
      </div>
    </nav>
  );
}
import React, { useState } from 'react';
import { ArrowLeft, Lock, Mail, ShieldAlert } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { LogoMark } from './Navbar';

interface AdminLoginProps {
  onBack: () => void;
}

export function AdminLogin({ onBack }: AdminLoginProps) {
  const { loginWithEmail, loginWithGoogle, user, isOwner, logout } = useLibrary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (msg.includes('auth/operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in your Firebase Console. Enable Authentication → Sign-in method → Email/Password, or sign in with Google below.'
        );
      } else if (
        msg.includes('auth/invalid-credential') ||
        msg.includes('auth/wrong-password') ||
        msg.includes('auth/user-not-found')
      ) {
        setError('Invalid owner email or password. Please verify your Firebase Authentication credentials.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col justify-center px-5 py-12">
      <div className="max-w-md w-full mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-[#2F5D62] hover:text-[#244A4E] mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Return to Library</span>
        </button>

        <div className="bg-white border border-[#E8E2D6] rounded-2xl p-7 sm:p-8 shadow-[0_6px_28px_rgba(43,43,43,0.05)]">
          <div className="flex items-center gap-3 mb-6">
            <LogoMark className="w-9 h-9" />
            <div>
              <h1 className="font-serif text-2xl font-semibold text-[#2B2B2B]">
                Owner Sign In
              </h1>
              <p className="text-xs text-[#6B6B6B]">Gyaan Ka Sagar Administration</p>
            </div>
          </div>

          {user && !isOwner && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-xs text-[#2B2B2B] space-y-2"
            >
              <div className="flex items-center gap-2 font-medium text-[#8C3B2B]">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Signed in as {user.email}, which is not the registered library owner.</span>
              </div>
              <p className="text-[#6B6B6B]">
                Only the single owner account may upload, edit, or delete books. If you created an
                email/password owner user in Firebase Console, add their UID (
                <code className="font-mono text-[11px]">{user.uid}</code>) to the{' '}
                <code className="font-mono text-[11px]">admins</code> collection or sign in with
                your verified owner Google account.
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-[#2F5D62] font-medium hover:underline cursor-pointer"
              >
                Sign out and try another account
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-[#FDF4F2] border border-[#E8C5BD] text-xs text-[#8C3B2B] leading-relaxed"
            >
              {error}
            </div>
          )}

          {/* Email + Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="owner-email"
                className="block text-xs font-medium text-[#2B2B2B] mb-1.5"
              >
                Owner Email
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="owner-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="owner-password"
                className="block text-xs font-medium text-[#2B2B2B] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-[#6B6B6B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="owner-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter owner password"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D6] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#2F5D62]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Signing in...' : 'Sign In with Email'}
            </button>
          </form>

          <div className="relative my-6 flex items-center">
            <div className="flex-1 h-px bg-[#E8E2D6]" />
            <span className="px-3 text-xs text-[#6B6B6B]">or</span>
            <div className="flex-1 h-px bg-[#E8E2D6]" />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogleSignIn}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl border border-[#E8E2D6] bg-white text-sm font-medium text-[#2B2B2B] hover:border-[#2F5D62] hover:text-[#2F5D62] disabled:opacity-50 transition-colors cursor-pointer"
          >
            Continue with Owner Google Account
          </button>

          <p className="mt-5 text-[11px] text-[#6B6B6B] leading-relaxed">
            Visitors do not need an account to browse the library. This login is reserved
            exclusively for the library owner.
          </p>
        </div>
      </div>
    </div>
  );
}

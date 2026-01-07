'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type ForgotPasswordResponse = {
  ok: boolean;
  message?: string;
  devResetUrl?: string; // only if backend chooses to return it
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDevUrl(null);
    setLoading(true);

    try {
      const res = await apiFetch<ForgotPasswordResponse>('/auth/forgot-password', {
        method: 'POST',
        body: { email }
      });

      setSent(true);
      if (res?.devResetUrl) setDevUrl(res.devResetUrl);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to request reset');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Forgot password</h1>
        <p className="text-sm opacity-70 mb-6">
          Enter your email and we’ll send you a reset link. (Dev mode may show the link on screen.)
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              If that email exists, a reset link has been generated.
            </div>

            {devUrl && (
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-semibold mb-1">Dev reset link</div>
                <a className="underline break-all" href={devUrl}>
                  {devUrl}
                </a>
              </div>
            )}

            <button className="w-full rounded-lg border py-2 font-medium" onClick={() => router.push('/login')}>
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <button
              disabled={loading}
              className="w-full rounded-lg bg-black text-white py-2 font-medium disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <button
              type="button"
              className="w-full rounded-lg border py-2 font-medium"
              onClick={() => router.push('/login')}
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

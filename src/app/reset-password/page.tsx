'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type ResetPasswordResponse = { ok: boolean; message?: string };

export default function ResetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const tokenFromUrl = useMemo(() => sp.get('token') || '', [sp]);

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiFetch<ResetPasswordResponse>('/auth/reset-password', {
        method: 'POST',
        body: { token, password }
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Reset password</h1>
        <p className="text-sm opacity-70 mb-6">Paste the token (or open the reset link) and set a new password.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              Password updated. You can log in now.
            </div>
            <button className="w-full rounded-lg bg-black text-white py-2 font-medium" onClick={() => router.push('/login')}>
              Go to login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Reset token</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="token from email/dev link"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">New password</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>

            <button
              disabled={loading}
              className="w-full rounded-lg bg-black text-white py-2 font-medium disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Reset password'}
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

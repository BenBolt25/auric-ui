'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function ResetPasswordClient() {
  const router = useRouter();
  const params = useSearchParams();

  const token = useMemo(() => params.get('token') || '', [params]);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg(null);
    setOkMsg(null);

    if (!token) {
      setErrMsg('Missing token. Please use the link from the reset email/dev output.');
      return;
    }
    if (!password || password.length < 8) {
      setErrMsg('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: { token, password }
      });

      setOkMsg('Password updated. You can log in now.');
      setTimeout(() => router.push('/login'), 400);
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Reset password</h1>
        <p className="text-sm opacity-70 mb-6">Choose a new password for your account.</p>

        {okMsg && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            {okMsg}
          </div>
        )}

        {errMsg && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Token</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"
              value={token}
              readOnly
            />
            <div className="mt-1 text-xs opacity-60">
              This is pulled from the URL query param <code>?token=...</code>
            </div>
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
            {loading ? 'Updating…' : 'Update password'}
          </button>

          <button
            type="button"
            className="w-full rounded-lg border py-2 font-medium"
            onClick={() => router.push('/login')}
            disabled={loading}
          >
            Back to login
          </button>
        </form>
      </div>
    </main>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';

type LoginResponse = { token: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password }
      });

      setToken(res.token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Log in</h1>
        <p className="text-sm opacity-70 mb-6">Sign in to view ATX and your journal.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

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
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-lg bg-black text-white py-2 font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Login'}
          </button>

          <button
            type="button"
            className="w-full rounded-lg border py-2 font-medium"
            onClick={() => router.push('/forgot-password')}
            disabled={loading}
          >
            Forgot password?
          </button>

          <button
            type="button"
            className="w-full rounded-lg border py-2 font-medium"
            onClick={() => router.push('/register')}
            disabled={loading}
          >
            Need an account? Register
          </button>

          <p className="text-xs opacity-60">
            API: {process.env.NEXT_PUBLIC_API_BASE_URL || '(missing)'}
          </p>
        </form>
      </div>
    </main>
  );
}

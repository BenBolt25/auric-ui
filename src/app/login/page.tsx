'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';

type LoginResponse = {
  token: string;
  user: { id: string; email: string };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('dev@auric.local');
  const [password, setPassword] = useState('dev');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(res.token);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6 shadow">
        <h1 className="text-2xl font-semibold">Auric</h1>
        <p className="mt-1 text-sm text-white/70">
          Behavioural monitoring, epochs, and reflective learning.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm text-white/80">Email</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm text-white/80">Password</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3 outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-white text-black py-3 font-medium disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border border-white/15 py-3 text-white"
            onClick={() => router.push('/register')}
          >
            Create account
          </button>
        </form>
      </div>
    </main>
  );
}

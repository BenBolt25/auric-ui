'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';

type RegisterResponse = { token: string };

function isAccountExistsError(err: unknown): boolean {
  const msg = (err as any)?.message;
  return typeof msg === 'string' && msg.includes('ACCOUNT_EXISTS');
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAccountExists(false);
    setLoading(true);

    try {
      const res = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: { email, password }
      });

      setToken(res.token);
      router.push('/dashboard');
    } catch (err: any) {
      if (isAccountExistsError(err)) {
        setAccountExists(true);
        setError('An account already exists for this email.');
      } else {
        setError(err?.message ?? 'Register failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Create account</h1>
        <p className="text-sm opacity-70 mb-6">
          Register to access your ATX dashboard and journal.
        </p>

        {error && !accountExists && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {accountExists && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Account already exists</div>
            <div className="mt-1 opacity-80">
              Use <span className="font-medium">Sign in</span> or reset your password.
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-black text-white px-3 py-2 text-sm"
                onClick={() => router.push('/login')}
              >
                Sign in
              </button>

              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => router.push('/forgot-password')}
                title="We can wire this page next"
              >
                Forgot password
              </button>
            </div>
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
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-lg bg-black text-white py-2 font-medium disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Register'}
          </button>

          <p className="text-xs opacity-60">
            API: {process.env.NEXT_PUBLIC_API_BASE_URL || '(missing)'}
          </p>

          <button
            type="button"
            className="w-full rounded-lg border py-2 font-medium"
            onClick={() => router.push('/login')}
            disabled={loading}
          >
            Already have an account? Log in
          </button>
        </form>
      </div>
    </main>
  );
}

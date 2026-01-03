'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { clearToken, getToken } from '@/lib/auth';

type DevAccountsResponse = { accounts: number[] };

type ATXResponse = {
  accountId: number;
  tradeCount: number;
  epoch?: { epochId: number; startedAt: number };
  atx: {
    score: number;
    subscores: {
      discipline: number;
      riskIntegrity: number;
      executionStability: number;
      behaviouralVolatility: number;
      consistency: number;
    };
    profiles?: string[];
    flags: string[];
  };
  commentary?: {
    summary: string;
    bulletPoints: string[];
    reflectionQuestions?: string[];
  };
};

export default function DashboardPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<number[]>([]);
  const [accountId, setAccountId] = useState<number>(123);

  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [timeframe, setTimeframe] = useState<'epoch' | 'weekly' | 'monthly'>(
    'epoch'
  );

  const [data, setData] = useState<ATXResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    // Load account ids for the switcher
    (async () => {
      try {
        const res = await apiFetch<DevAccountsResponse>('/dev/accounts', {
          token
        });
        setAccounts(res.accounts || []);
        if (res.accounts?.length) setAccountId(res.accounts[0]);
      } catch (e: any) {
        // Don’t block dashboard if dev endpoint isn’t available
        console.warn(e?.message || e);
      }
    })();
  }, [token]);

  async function loadATX() {
    setLoading(true);
    setErr(null);
    setData(null);

    try {
      const res = await apiFetch<ATXResponse>(
        `/atx/accounts/${accountId}?source=${source}&timeframe=${timeframe}`,
        { token }
      );
      setData(res);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load ATX');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadATX();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, source, timeframe]);

  return (
    <Protected>
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-sm opacity-70">
                API: {process.env.NEXT_PUBLIC_API_BASE_URL || '(missing)'}
              </p>
            </div>

            <button
              className="px-3 py-2 rounded-md border text-sm"
              onClick={() => {
                clearToken();
                router.push('/login');
              }}
            >
              Logout
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-md border">
              <div className="text-xs opacity-60 mb-1">Account</div>
              <select
                className="w-full border rounded-md p-2"
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
              >
                {(accounts.length ? accounts : [123]).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-md border">
              <div className="text-xs opacity-60 mb-1">Source</div>
              <select
                className="w-full border rounded-md p-2"
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
              >
                <option value="mock">mock</option>
                <option value="live">live</option>
              </select>
            </div>

            <div className="p-3 rounded-md border">
              <div className="text-xs opacity-60 mb-1">Timeframe</div>
              <select
                className="w-full border rounded-md p-2"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as any)}
              >
                <option value="epoch">epoch</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-md bg-black text-white"
              onClick={loadATX}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <button
              className="px-4 py-2 rounded-md border"
              onClick={() => router.push('/journal')}
            >
              Journal
            </button>
          </div>

          {err && (
            <div className="p-3 rounded-md border border-red-300 bg-red-50 text-red-800">
              {err}
            </div>
          )}

          {!err && !data && loading && (
            <div className="p-3 rounded-md border">Loading…</div>
          )}

          {data && (
            <div className="space-y-4">
              <div className="p-4 rounded-md border">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">
                    ATX Score: {data.atx.score}
                  </h2>
                  <div className="text-sm opacity-70">
                    Trades: {data.tradeCount}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="p-3 rounded-md bg-black/5">
                    Discipline: {data.atx.subscores.discipline}
                  </div>
                  <div className="p-3 rounded-md bg-black/5">
                    Risk Integrity: {data.atx.subscores.riskIntegrity}
                  </div>
                  <div className="p-3 rounded-md bg-black/5">
                    Execution Stability: {data.atx.subscores.executionStability}
                  </div>
                  <div className="p-3 rounded-md bg-black/5">
                    Behavioural Volatility:{' '}
                    {data.atx.subscores.behaviouralVolatility}
                  </div>
                  <div className="p-3 rounded-md bg-black/5">
                    Consistency: {data.atx.subscores.consistency}
                  </div>
                </div>

                {data.atx.flags?.length ? (
                  <div className="mt-3 text-sm">
                    <div className="opacity-60 mb-1">Flags</div>
                    <div className="flex flex-wrap gap-2">
                      {data.atx.flags.map((f) => (
                        <span
                          key={f}
                          className="px-2 py-1 rounded-md border text-xs"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {data.commentary && (
                <div className="p-4 rounded-md border">
                  <h3 className="font-semibold">Commentary</h3>
                  <p className="mt-2 text-sm">{data.commentary.summary}</p>
                  {data.commentary.bulletPoints?.length ? (
                    <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                      {data.commentary.bulletPoints.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Protected>
  );
}

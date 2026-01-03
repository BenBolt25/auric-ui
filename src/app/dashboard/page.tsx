'use client';

import { useEffect, useMemo, useState } from 'react';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';

type DevAccountsResponse = {
  accounts: Array<{
    accountId: number;
    sources: Array<'mock' | 'live'>;
    tradeCounts: { mock: number; live: number };
  }>;
};

type ATXResponse = {
  accountId: number;
  source: 'mock' | 'live';
  tradeCount: number;
  timeframe: 'weekly' | 'monthly' | 'epoch' | 'daily';
  epoch: { epochId: number; startedAt: number };
  atx: {
    score: number;
    subscores: {
      discipline: number;
      riskIntegrity: number;
      executionStability: number;
      behaviouralVolatility: number;
      consistency: number;
    };
    flags: string[];
    profiles: string[];
  };
  commentary: {
    summary: string;
    bullets: string[];
    reflectionQuestions: string[];
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<DevAccountsResponse['accounts']>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly' | 'epoch'>('weekly');
  const [data, setData] = useState<ATXResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => accounts.find(a => a.accountId === accountId) ?? null,
    [accounts, accountId]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<DevAccountsResponse>('/dev/accounts');
        setAccounts(res.accounts);
        if (res.accounts.length && accountId === null) {
          setAccountId(res.accounts[0].accountId);
          setSource(res.accounts[0].sources.includes('mock') ? 'mock' : 'live');
        }
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load accounts');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setError(null);

    (async () => {
      try {
        const res = await apiFetch<ATXResponse>(
          `/atx/accounts/${accountId}?source=${source}&timeframe=${timeframe}`,
          { auth: true }
        );
        setData(res);
      } catch (e: any) {
        setData(null);
        setError(e?.message ?? 'Failed to load ATX');
      }
    })();
  }, [accountId, source, timeframe]);

  return (
    <Protected>
      <main className="min-h-screen p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-white/70">
              Behavioural state, epochs, and reflective learning.
            </p>
          </div>
          <button
            className="rounded-xl border border-white/15 px-4 py-2"
            onClick={() => {
              clearToken();
              router.replace('/login');
            }}
          >
            Logout
          </button>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <h2 className="font-medium">Account</h2>

            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm text-white/70">Account ID</label>
                <select
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3"
                  value={accountId ?? ''}
                  onChange={(e) => setAccountId(Number(e.target.value))}
                >
                  {accounts.map(a => (
                    <option key={a.accountId} value={a.accountId}>
                      {a.accountId} (mock {a.tradeCounts.mock}, live {a.tradeCounts.live})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-white/70">Source</label>
                  <select
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3"
                    value={source}
                    onChange={(e) => setSource(e.target.value as any)}
                  >
                    <option value="mock" disabled={!selected?.sources.includes('mock')}>
                      mock
                    </option>
                    <option value="live" disabled={!selected?.sources.includes('live')}>
                      live
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-white/70">Timeframe</label>
                  <select
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3"
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as any)}
                  >
                    <option value="weekly">weekly</option>
                    <option value="monthly">monthly</option>
                    <option value="epoch">epoch</option>
                  </select>
                </div>
              </div>

              <button
                className="w-full rounded-xl border border-white/15 py-3"
                onClick={() => router.push('/journal')}
              >
                Open Journal
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 lg:col-span-2">
            <h2 className="font-medium">ATX</h2>

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
                {error}
              </div>
            )}

            {!data && !error && (
              <div className="mt-3 text-sm text-white/70">Loading…</div>
            )}

            {data && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white/70">
                    Epoch <span className="text-white">{data.epoch.epochId}</span>
                  </div>
                  <div className="text-sm text-white/70">
                    Trades <span className="text-white">{data.tradeCount}</span>
                  </div>
                  <div className="text-sm text-white/70">
                    Score <span className="text-white">{data.atx.score}</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  {Object.entries(data.atx.subscores).map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs uppercase text-white/60">{k}</div>
                      <div className="mt-1 text-lg font-semibold">{v}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-medium">Commentary</div>
                  <div className="mt-2 text-sm text-white/80">{data.commentary.summary}</div>

                  {data.commentary.bullets?.length > 0 && (
                    <ul className="mt-3 list-disc pl-5 text-sm text-white/75 space-y-1">
                      {data.commentary.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}

                  {data.commentary.reflectionQuestions?.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs uppercase text-white/60">Reflection</div>
                      <ul className="mt-2 list-disc pl-5 text-sm text-white/75 space-y-1">
                        {data.commentary.reflectionQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {(data.atx.flags?.length > 0 || data.atx.profiles?.length > 0) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-medium">Flags</div>
                      <div className="mt-2 text-sm text-white/75">
                        {data.atx.flags.length ? data.atx.flags.join(', ') : 'None'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-medium">Profiles</div>
                      <div className="mt-2 text-sm text-white/75">
                        {data.atx.profiles.length ? data.atx.profiles.join(', ') : 'None'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </Protected>
  );
}

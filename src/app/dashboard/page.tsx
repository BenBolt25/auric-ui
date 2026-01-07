'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';

type Account = {
  accountId: number;
  name: string;
  createdAt: number;
};

type AccountsResponse = { accounts: Account[] };
type CreateAccountResponse = { account: Account };

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
    bulletPoints?: string[];
    bullets?: string[];
    reflectionQuestions?: string[];
  };
};

type TrendPoint = {
  label: string;
  startDate: string;
  endDate: string;
  tradeCount: number;
  atx: null | {
    score: number;
    subscores: {
      discipline: number;
      riskIntegrity: number;
      executionStability: number;
      behaviouralVolatility: number;
      consistency: number;
    };
    flags: string[];
  };
  epochId: number;
  epochStart: boolean;
};

type TrendResponse = {
  accountId: number;
  period: 'daily' | 'weekly' | 'monthly';
  lookback: number;
  sources: string[];
  points: TrendPoint[];
};

function toDisplayString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object') {
    const anyVal = value as any;
    if (typeof anyVal.message === 'string') return anyVal.message;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  try {
    return String(value);
  } catch {
    return 'Unknown error';
  }
}

function safeBullets(c?: ATXResponse['commentary']): string[] {
  if (!c) return [];
  if (Array.isArray(c.bulletPoints)) return c.bulletPoints;
  if (Array.isArray(c.bullets)) return c.bullets;
  return [];
}

function TrendChart({
  points,
  height = 160
}: {
  points: TrendPoint[];
  height?: number;
}) {
  const w = 760; // virtual width (responsive via viewBox)

  const scored = points
    .map((p) => (p.atx ? p.atx.score : null))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

  const min = scored.length ? Math.min(...scored) : 0;
  const max = scored.length ? Math.max(...scored) : 100;

  const pad = 12;
  const innerH = height - pad * 2;
  const innerW = w - pad * 2;

  function x(i: number) {
    if (points.length <= 1) return pad;
    return pad + (i / (points.length - 1)) * innerW;
  }

  function y(score: number) {
    if (max === min) return pad + innerH / 2;
    const t = (score - min) / (max - min);
    return pad + (1 - t) * innerH;
  }

  const poly = points
    .map((p, i) => {
      const s = p.atx?.score;
      if (typeof s !== 'number') return null;
      return `${x(i)},${y(s)}`;
    })
    .filter(Boolean)
    .join(' ');

  const epochMarkers = points
    .map((p, i) => (p.epochStart ? { i, epochId: p.epochId } : null))
    .filter(Boolean) as Array<{ i: number; epochId: number }>;

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">ATX Trend</div>
        <div className="text-xs opacity-60">
          Epoch starts marked • gaps = no trades
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${height}`}
          className="w-full"
          role="img"
          aria-label="ATX trend chart"
        >
          {/* grid */}
          <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="currentColor" opacity="0.08" />
          <line x1={pad} y1={height - pad} x2={w - pad} y2={height - pad} stroke="currentColor" opacity="0.08" />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" opacity="0.08" />
          <line x1={w - pad} y1={pad} x2={w - pad} y2={height - pad} stroke="currentColor" opacity="0.08" />

          {/* epoch markers */}
          {epochMarkers.map((m) => (
            <g key={`e-${m.i}`}>
              <line
                x1={x(m.i)}
                y1={pad}
                x2={x(m.i)}
                y2={height - pad}
                stroke="currentColor"
                opacity="0.15"
              />
              <text
                x={x(m.i) + 4}
                y={pad + 12}
                fontSize="10"
                fill="currentColor"
                opacity="0.5"
              >
                E{m.epochId}
              </text>
            </g>
          ))}

          {/* polyline */}
          {poly ? (
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.85"
              points={poly}
            />
          ) : null}

          {/* points */}
          {points.map((p, i) => {
            const s = p.atx?.score;
            if (typeof s !== 'number') return null;
            return (
              <circle
                key={`p-${i}`}
                cx={x(i)}
                cy={y(s)}
                r={3}
                fill="currentColor"
                opacity="0.85"
              />
            );
          })}
        </svg>
      </div>

      <div className="mt-3 text-xs opacity-70 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>Min: {min}</div>
        <div>Max: {max}</div>
        <div>Points: {points.length}</div>
        <div>Scored: {scored.length}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [timeframe, setTimeframe] = useState<'epoch' | 'weekly' | 'monthly'>('epoch');

  const [data, setData] = useState<ATXResponse | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [debugPayload, setDebugPayload] = useState<unknown>(null);

  const [loading, setLoading] = useState(false);
  const [seedInfo, setSeedInfo] = useState<string | null>(null);

  // Trend state
  const [trendPeriod, setTrendPeriod] = useState<'weekly' | 'monthly' | 'daily'>('weekly');
  const [trendLookback, setTrendLookback] = useState<number>(26);
  const [trend, setTrend] = useState<TrendResponse | null>(null);

  const errText = useMemo(() => (err ? toDisplayString(err) : null), [err]);

  async function ensureAccounts() {
    const list = await apiFetch<AccountsResponse>('/accounts', { auth: true });
    let accs = list.accounts || [];

    if (!accs.length) {
      const created = await apiFetch<CreateAccountResponse>('/accounts', {
        method: 'POST',
        auth: true,
        body: { name: 'Primary' }
      });
      accs = [created.account];
    }

    setAccounts(accs);
    if (!accountId && accs.length) setAccountId(accs[0].accountId);
  }

  useEffect(() => {
    ensureAccounts().catch((e) => setErr(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadATX() {
    if (!accountId) return;

    setLoading(true);
    setErr(null);
    setSeedInfo(null);
    setData(null);
    setDebugPayload(null);

    try {
      const res = await apiFetch<unknown>(
        `/atx/accounts/${accountId}?source=${source}&timeframe=${timeframe}`,
        { auth: true }
      );

      const r: any = res as any;
      if (!r || typeof r !== 'object' || !r.atx || typeof r.atx.score !== 'number') {
        setDebugPayload(res);
        setErr(`Unexpected ATX response shape.`);
        return;
      }

      setData(r as ATXResponse);
    } catch (e: any) {
      setErr(e?.message ?? e ?? 'Failed to load ATX');
    } finally {
      setLoading(false);
    }
  }

  async function loadTrend() {
    if (!accountId) return;

    try {
      const qs = new URLSearchParams();
      qs.set('period', trendPeriod);
      qs.set('lookback', String(trendLookback));
      qs.set('sources', source); // tie trend to current source select
      const res = await apiFetch<TrendResponse>(`/atx/accounts/${accountId}/trend?${qs.toString()}`, {
        auth: true
      });
      setTrend(res);
    } catch (e: any) {
      // trend errors shouldn't kill the whole page, but show them
      setErr(e?.message ?? e ?? 'Failed to load trend');
    }
  }

  async function seedMockTrades() {
    if (!accountId) return;

    setLoading(true);
    setErr(null);
    setSeedInfo(null);

    try {
      const res = await apiFetch<{ ok: boolean; accountId: number; inserted: number }>(
        `/accounts/${accountId}/seed-mock-trades`,
        {
          method: 'POST',
          auth: true,
          body: { count: 300 }
        }
      );

      setSeedInfo(`Seeded ${res.inserted} mock trades for account ${res.accountId}.`);
      await loadATX();
      await loadTrend();
    } catch (e: any) {
      setErr(e?.message ?? e ?? 'Failed to seed mock trades');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accountId) return;
    loadATX();
    loadTrend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, source, timeframe]);

  useEffect(() => {
    if (!accountId) return;
    loadTrend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriod, trendLookback]);

  return (
    <Protected>
      <div className="min-h-screen p-6">
        <div className="max-w-5xl mx-auto space-y-6">
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

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-md border">
              <div className="text-xs opacity-60 mb-1">Account</div>
              <select
                className="w-full border rounded-md p-2"
                value={accountId || ''}
                onChange={(e) => setAccountId(Number(e.target.value))}
              >
                <option value="" disabled>
                  Select…
                </option>
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.name} (#{a.accountId})
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

          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded-md bg-black text-white"
              onClick={loadATX}
              disabled={loading || !accountId}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <button
              className="px-4 py-2 rounded-md border"
              onClick={seedMockTrades}
              disabled={loading || !accountId}
              title="Seeds mock trades then refreshes ATX + trend"
            >
              Seed mock trades
            </button>

            <button className="px-4 py-2 rounded-md border" onClick={() => router.push('/journal')}>
              Journal
            </button>
          </div>

          {/* Trend controls */}
          <div className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs opacity-60 mb-1">Trend period</div>
                <select
                  className="border rounded-md p-2"
                  value={trendPeriod}
                  onChange={(e) => setTrendPeriod(e.target.value as any)}
                >
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="daily">daily</option>
                </select>
              </div>

              <div>
                <div className="text-xs opacity-60 mb-1">Lookback</div>
                <input
                  type="number"
                  className="border rounded-md p-2 w-28"
                  value={trendLookback}
                  onChange={(e) => setTrendLookback(Number(e.target.value))}
                  min={4}
                  max={260}
                />
              </div>

              <button className="px-3 py-2 rounded-md border" onClick={loadTrend} disabled={!accountId}>
                Reload trend
              </button>
            </div>

            <div className="mt-4">
              {trend?.points?.length ? (
                <TrendChart points={trend.points} />
              ) : (
                <div className="text-sm opacity-70">Trend not loaded yet.</div>
              )}
            </div>
          </div>

          {seedInfo && !errText && (
            <div className="p-3 rounded-md border border-green-300 bg-green-50 text-green-900">
              {seedInfo}
            </div>
          )}

          {errText && (
            <div className="p-3 rounded-md border border-red-300 bg-red-50 text-red-800">
              <div className="font-semibold mb-2">Error</div>
              <pre className="text-xs whitespace-pre-wrap">{errText}</pre>
            </div>
          )}

          {debugPayload != null && (
            <div className="p-3 rounded-md border">
              <div className="font-semibold mb-2">Debug: raw response</div>
              <pre className="text-xs whitespace-pre-wrap">{toDisplayString(debugPayload)}</pre>
            </div>
          )}

          {!errText && !data && loading && <div className="p-3 rounded-md border">Loading…</div>}

          {data && (
            <div className="space-y-4">
              <div className="p-4 rounded-md border">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">ATX Score: {data.atx.score}</h2>
                  <div className="text-sm opacity-70">Trades: {data.tradeCount}</div>
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
                    Behavioural Volatility: {data.atx.subscores.behaviouralVolatility}
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
                        <span key={f} className="px-2 py-1 rounded-md border text-xs">
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
                  {safeBullets(data.commentary).length ? (
                    <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                      {safeBullets(data.commentary).map((b, i) => (
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

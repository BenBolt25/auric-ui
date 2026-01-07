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
    bulletPoints: string[];
    reflectionQuestions?: string[];
  };
};

type TrendPoint = {
  startedAt: number;
  score: number;
  subscores?: ATXResponse['atx']['subscores'];
  epochId?: number;
};

type EpochEvent = {
  epochId: number;
  startedAt: number;
  endedAt: number | null;
  triggerFlags: string[];
  endedReason: string | null;
  createdAt: number;
};

type TrendResponse = {
  accountId: number;
  timeframe: 'epoch' | 'weekly' | 'monthly';
  points: TrendPoint[];
  epochs: EpochEvent[];
};

type EpochRect = {
  key: string;
  x: number;
  w: number;
  label: string;
  endedAt: number | null;
  reason: string | null;
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

export default function DashboardPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [timeframe, setTimeframe] = useState<'epoch' | 'weekly' | 'monthly'>('epoch');

  const [data, setData] = useState<ATXResponse | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);

  const [err, setErr] = useState<unknown>(null);
  const [debugPayload, setDebugPayload] = useState<unknown>(null);

  const [loading, setLoading] = useState(false);
  const [seedInfo, setSeedInfo] = useState<string | null>(null);

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
        setErr('Unexpected ATX response shape.');
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
      // GET /atx/accounts/:accountId/trend?timeframe=weekly|monthly|epoch
      const res = await apiFetch<TrendResponse>(
        `/atx/accounts/${accountId}/trend?timeframe=${timeframe}`,
        { auth: true }
      );
      setTrend(res);
    } catch (e: any) {
      console.warn('Failed to load trend:', e?.message ?? e);
      setTrend(null);
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
      await Promise.all([loadATX(), loadTrend()]);
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

  const chart = useMemo(() => {
    const pts = trend?.points ?? [];
    const epochs = trend?.epochs ?? [];

    const width = 760;
    const height = 220;
    const pad = 24;

    if (pts.length < 2) {
      return { width, height, svg: null as null | { poly: string; epochRects: EpochRect[]; min: number; max: number } };
    }

    const scores = pts.map((p) => p.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = Math.max(1, max - min);

    const xForIndex = (i: number) =>
      pad + (i / Math.max(1, pts.length - 1)) * (width - pad * 2);

    const yForScore = (s: number) =>
      pad + ((max - s) / range) * (height - pad * 2);

    const xs = pts.map((_p, i) => xForIndex(i));
    const poly = pts.map((p, i) => `${xs[i]},${yForScore(p.score)}`).join(' ');

    const epochRects: EpochRect[] = epochs.map((e) => {
      const startIdx = pts.findIndex((p) => p.startedAt >= e.startedAt);
      const endedAt = e.endedAt;
      const endIdx = endedAt == null ? -1 : pts.findIndex((p) => p.startedAt >= endedAt);

      const startX = startIdx >= 0 ? xs[startIdx] : xs[0];
      const endX = endIdx >= 0 ? xs[endIdx] : xs[xs.length - 1];

      const x = Math.min(startX, endX);
      const w = Math.max(2, Math.abs(endX - startX));

      return {
        key: `epoch-${e.epochId}`,
        x,
        w,
        label: `Epoch ${e.epochId}`,
        endedAt,
        reason: e.endedReason
      };
    });

    return {
      width,
      height,
      svg: { poly, epochRects, min, max }
    };
  }, [trend]);

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
              onClick={() => {
                loadATX();
                loadTrend();
              }}
              disabled={loading || !accountId}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <button
              className="px-4 py-2 rounded-md border"
              onClick={seedMockTrades}
              disabled={loading || !accountId}
              title="Seeds mock trades, then refreshes ATX"
            >
              Seed mock trades
            </button>

            <button className="px-4 py-2 rounded-md border" onClick={() => router.push('/journal')}>
              Journal
            </button>
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

          {/* Trend chart */}
          <div className="p-4 rounded-md border">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-semibold">ATX Trend</div>
                <div className="text-xs opacity-60">
                  {trend?.points?.length ? `${trend.points.length} points` : 'No points yet'}
                </div>
              </div>
              <div className="text-xs opacity-60">Epochs shown as shaded regions</div>
            </div>

            <div className="mt-3 overflow-x-auto">
              {chart.svg ? (
                <svg
                  width={chart.width}
                  height={chart.height}
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  className="block"
                >
                  {/* Epoch shaded regions */}
                  {chart.svg.epochRects.map((r: EpochRect) => (
                    <g key={r.key}>
                      <rect x={r.x} y={0} width={r.w} height={chart.height} opacity={0.08} />
                      <line x1={r.x} y1={0} x2={r.x} y2={chart.height} opacity={0.25} strokeWidth={1} />
                    </g>
                  ))}

                  {/* Trend */}
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    points={chart.svg.poly}
                    opacity={0.9}
                  />

                  <text x={8} y={16} fontSize={11} opacity={0.6}>
                    max: {chart.svg.max}
                  </text>
                  <text x={8} y={chart.height - 8} fontSize={11} opacity={0.6}>
                    min: {chart.svg.min}
                  </text>
                </svg>
              ) : (
                <div className="text-sm opacity-70">
                  Not enough trend data yet. Seed trades and refresh a few times (or wait for weekly/monthly points).
                </div>
              )}
            </div>
          </div>

          {data && (
            <div className="space-y-4">
              <div className="p-4 rounded-md border">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">ATX Score: {data.atx.score}</h2>
                  <div className="text-sm opacity-70">Trades: {data.tradeCount}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="p-3 rounded-md bg-black/5">Discipline: {data.atx.subscores.discipline}</div>
                  <div className="p-3 rounded-md bg-black/5">Risk Integrity: {data.atx.subscores.riskIntegrity}</div>
                  <div className="p-3 rounded-md bg-black/5">
                    Execution Stability: {data.atx.subscores.executionStability}
                  </div>
                  <div className="p-3 rounded-md bg-black/5">
                    Behavioural Volatility: {data.atx.subscores.behaviouralVolatility}
                  </div>
                  <div className="p-3 rounded-md bg-black/5">Consistency: {data.atx.subscores.consistency}</div>
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

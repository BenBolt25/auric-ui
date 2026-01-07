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

type ATXSnapshot = {
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

type ATXResponse = {
  accountId: number;
  tradeCount: number;
  epoch?: { epochId: number; startedAt: number };
  atx: ATXSnapshot;
  commentary?: {
    summary: string;
    bulletPoints?: string[];
    bullets?: string[]; // backend sometimes uses bullets
    reflectionQuestions?: string[];
  };
};

type TrendPoint = {
  startedAt: number;
  tradeCount?: number;
  atx?: ATXSnapshot; // some backends return {atx}
  score?: number; // some backends return flattened {score}
  subscores?: ATXSnapshot['subscores'];
  flags?: string[];
};

type EpochEvent = {
  epochId: number;
  startedAt: number;
  endedAt: number | null;
  triggerFlags: string[];
  endedReason?: string | null;
  startedATX?: ATXSnapshot | null;
  endedATX?: ATXSnapshot | null;
  createdAt: number;
};

type TrendResponse = {
  accountId: number;
  timeframe: string;
  points: TrendPoint[];
  epochs: EpochEvent[];
};

const SELECTED_ACCOUNT_KEY = 'auric_selected_account_id';

function getStoredAccountId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SELECTED_ACCOUNT_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setStoredAccountId(id: number) {
  if (typeof window === 'undefined') return;
  if (!id) return;
  window.localStorage.setItem(SELECTED_ACCOUNT_KEY, String(id));
}

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

type MetricKey =
  | 'score'
  | 'discipline'
  | 'riskIntegrity'
  | 'executionStability'
  | 'behaviouralVolatility'
  | 'consistency';

function metricLabel(k: MetricKey) {
  switch (k) {
    case 'score':
      return 'ATX Score';
    case 'discipline':
      return 'Discipline';
    case 'riskIntegrity':
      return 'Risk Integrity';
    case 'executionStability':
      return 'Execution Stability';
    case 'behaviouralVolatility':
      return 'Behavioural Volatility';
    case 'consistency':
      return 'Consistency';
  }
}

function fmtDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return String(ms);
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function getPointATX(p: TrendPoint): ATXSnapshot | null {
  if (p.atx && typeof p.atx.score === 'number') return p.atx;
  if (typeof p.score === 'number' && p.subscores) {
    return {
      score: p.score,
      subscores: p.subscores,
      flags: p.flags ?? [],
      profiles: []
    };
  }
  return null;
}

function getMetricValueFromPoint(p: TrendPoint, key: MetricKey): number | null {
  const atx = getPointATX(p);
  if (!atx) return null;
  if (key === 'score') return atx.score;
  return atx.subscores?.[key] ?? null;
}

export default function DashboardPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [source, setSource] = useState<'mock' | 'live'>('mock');
  const [timeframe, setTimeframe] = useState<'epoch' | 'weekly' | 'monthly'>('epoch');

  const [data, setData] = useState<ATXResponse | null>(null);

  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [metric, setMetric] = useState<MetricKey>('score');

  const [err, setErr] = useState<unknown>(null);
  const [debugPayload, setDebugPayload] = useState<unknown>(null);

  const [loading, setLoading] = useState(false);
  const [seedInfo, setSeedInfo] = useState<string | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverEpochId, setHoverEpochId] = useState<number | null>(null);

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

    const stored = getStoredAccountId();
    const picked =
      (stored && accs.find((a) => a.accountId === stored)?.accountId) || accs[0].accountId;

    setAccountId(picked);
    setStoredAccountId(picked);
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
      // Expect backend Trend API to return { points, epochs }
      const res = await apiFetch<TrendResponse>(
        `/atx/accounts/${accountId}/trend?timeframe=daily&limit=180&source=${source}`,
        { auth: true }
      );
      setTrend(res);
    } catch (e) {
      // Don't block the whole dashboard if trend fails
      console.warn('Trend load failed:', e);
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
    const pts = (trend?.points ?? []).filter((p) => typeof p.startedAt === 'number');
    if (pts.length < 2) return null;

    const xsW = 900;
    const ysH = 260;
    const pad = 28;

    const minTs = pts[0].startedAt;
    const maxTs = pts[pts.length - 1].startedAt;
    const spanTs = Math.max(1, maxTs - minTs);

    const values: Array<number | null> = pts.map((p) => getMetricValueFromPoint(p, metric));
    const cleanVals = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (!cleanVals.length) return null;

    const minV = Math.min(...cleanVals);
    const maxV = Math.max(...cleanVals);
    const spanV = Math.max(1, maxV - minV);

    const xForTs = (ts: number) => pad + ((ts - minTs) / spanTs) * (xsW - pad * 2);
    const yForV = (v: number) => pad + (1 - (v - minV) / spanV) * (ysH - pad * 2);

    const ptsXY = pts.map((p, i) => {
      const v = values[i];
      const ts = p.startedAt;
      const x = xForTs(ts);
      const y = typeof v === 'number' ? yForV(v) : null;
      return { x, y, ts, v, p };
    });

    // Build path (skip nulls)
    let d = '';
    for (const item of ptsXY) {
      if (item.y == null) continue;
      if (!d) d = `M ${item.x.toFixed(2)} ${item.y.toFixed(2)}`;
      else d += ` L ${item.x.toFixed(2)} ${item.y.toFixed(2)}`;
    }

    const epochs = trend?.epochs ?? [];
    const epochRects = epochs
      .map((e) => {
        const x0 = xForTs(clamp(e.startedAt, minTs, maxTs));
        const endTs = e.endedAt == null ? maxTs : clamp(e.endedAt, minTs, maxTs);
        const x1 = xForTs(endTs);
        const width = Math.max(0, x1 - x0);
        return {
          key: `epoch-${e.epochId}`,
          epoch: e,
          x: x0,
          w: width
        };
      })
      .filter((r) => r.w > 0);

    const epochLines = epochs.map((e) => ({
      key: `epoch-line-${e.epochId}`,
      epoch: e,
      x: xForTs(clamp(e.startedAt, minTs, maxTs))
    }));

    return { svg: { w: xsW, h: ysH, pad }, ptsXY, d, minV, maxV, epochRects, epochLines };
  }, [trend, metric]);

  const hoverPoint = useMemo(() => {
    if (!chart || hoverIdx == null) return null;
    const item = chart.ptsXY[hoverIdx];
    if (!item) return null;
    return item;
  }, [chart, hoverIdx]);

  const hoverEpoch = useMemo(() => {
    if (!trend || hoverEpochId == null) return null;
    return (trend.epochs ?? []).find((e) => e.epochId === hoverEpochId) ?? null;
  }, [trend, hoverEpochId]);

  function onChartMove(ev: React.MouseEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = (ev.currentTarget as any).getBoundingClientRect?.();
    if (!rect) return;

    const relX = ev.clientX - rect.left;
    const viewX = (relX / rect.width) * chart.svg.w;

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < chart.ptsXY.length; i++) {
      const dx = Math.abs(chart.ptsXY[i].x - viewX);
      if (dx < bestDist) {
        bestDist = dx;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  }

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-md border">
              <div className="text-xs opacity-60 mb-1">Account</div>
              <select
                className="w-full border rounded-md p-2"
                value={accountId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setAccountId(id);
                  setStoredAccountId(id);
                }}
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
              title="Seeds mock trades then refreshes ATX + trend"
            >
              Seed mock trades
            </button>

            <button
              className="px-4 py-2 rounded-md border"
              onClick={() => router.push('/journal')}
            >
              Journal
            </button>
          </div>

          {/* Trend chart */}
          <div className="p-4 rounded-md border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Trend</div>
                <div className="text-xs opacity-60">
                  {trend?.points?.length ? `${trend.points.length} points` : 'No trend data yet'}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    'score',
                    'discipline',
                    'riskIntegrity',
                    'executionStability',
                    'behaviouralVolatility',
                    'consistency'
                  ] as MetricKey[]
                ).map((k) => (
                  <button
                    key={k}
                    className={[
                      'px-3 py-1.5 rounded-md border text-xs',
                      metric === k ? 'bg-black text-white border-black' : 'border-black/20'
                    ].join(' ')}
                    onClick={() => setMetric(k)}
                    disabled={!trend?.points?.length}
                    title={`Show ${metricLabel(k)}`}
                  >
                    {k === 'score' ? 'ATX' : metricLabel(k)}
                  </button>
                ))}
              </div>
            </div>

            {chart ? (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${chart.svg.w} ${chart.svg.h}`}
                  className="w-full h-[260px] select-none"
                  onMouseMove={onChartMove}
                  onMouseLeave={() => {
                    setHoverIdx(null);
                    setHoverEpochId(null);
                  }}
                >
                  {/* Epoch shaded regions */}
                  {chart.svg && chart.epochRects.map((r: { key: string; x: number; w: number; epoch: EpochEvent }) => (
                    <g key={r.key}>
                      <rect
                        x={r.x}
                        y={chart.svg.pad}
                        width={r.w}
                        height={chart.svg.h - chart.svg.pad * 2}
                        opacity={0.06}
                        onMouseEnter={() => setHoverEpochId(r.epoch.epochId)}
                        onMouseLeave={() => setHoverEpochId(null)}
                      >
                        <title>
                          {`Epoch ${r.epoch.epochId}\nStarted: ${fmtDate(r.epoch.startedAt)}\nEnded: ${
                            r.epoch.endedAt ? fmtDate(r.epoch.endedAt) : '—'
                          }\nReason: ${r.epoch.endedReason ?? '—'}\nFlags: ${(r.epoch.triggerFlags ?? []).join(', ') || '—'}`}
                        </title>
                      </rect>
                    </g>
                  ))}

                  {/* Trend line */}
                  <path d={chart.d} fill="none" strokeWidth="2" />

                  {/* Epoch start lines + labels */}
                  {chart.epochLines.map((l: { key: string; x: number; epoch: EpochEvent }) => (
                    <g key={l.key}>
                      <line
                        x1={l.x}
                        y1={chart.svg.pad}
                        x2={l.x}
                        y2={chart.svg.h - chart.svg.pad}
                        strokeWidth="1"
                        opacity={0.35}
                        onMouseEnter={() => setHoverEpochId(l.epoch.epochId)}
                        onMouseLeave={() => setHoverEpochId(null)}
                      >
                        <title>
                          {`Epoch ${l.epoch.epochId}\nStarted: ${fmtDate(l.epoch.startedAt)}\nReason: ${
                            l.epoch.endedReason ?? '—'
                          }\nFlags: ${(l.epoch.triggerFlags ?? []).join(', ') || '—'}`}
                        </title>
                      </line>
                      <text x={l.x + 4} y={chart.svg.pad + 12} fontSize="10" opacity={0.7}>
                        {`E${l.epoch.epochId}`}
                      </text>
                    </g>
                  ))}

                  {/* Points */}
                  {chart.ptsXY.map((p, i) =>
                    p.y == null ? null : (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={i === hoverIdx ? 4 : 2.5}
                        opacity={i === hoverIdx ? 0.95 : 0.55}
                      >
                        <title>{`${fmtDate(p.ts)} • ${metricLabel(metric)}: ${
                          typeof p.v === 'number' ? p.v : '—'
                        }`}</title>
                      </circle>
                    )
                  )}
                </svg>

                {/* Hover tooltip */}
                {(hoverPoint || hoverEpoch) && (
                  <div className="absolute right-3 top-3 rounded-md border bg-white p-3 text-xs shadow-sm max-w-[320px]">
                    {hoverPoint && (
                      <div className="space-y-1">
                        <div className="font-semibold">{fmtDate(hoverPoint.ts)}</div>
                        <div>
                          <span className="opacity-70">{metricLabel(metric)}:</span>{' '}
                          <span className="font-semibold">
                            {typeof hoverPoint.v === 'number' ? Math.round(hoverPoint.v) : '—'}
                          </span>
                        </div>
                        {(() => {
                          const atx = getPointATX(hoverPoint.p);
                          if (!atx) return null;
                          return (
                            <div className="pt-1 space-y-0.5 opacity-80">
                              <div>ATX: {atx.score}</div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <div>D: {atx.subscores.discipline}</div>
                                <div>R: {atx.subscores.riskIntegrity}</div>
                                <div>E: {atx.subscores.executionStability}</div>
                                <div>V: {atx.subscores.behaviouralVolatility}</div>
                                <div>C: {atx.subscores.consistency}</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {hoverEpoch && (
                      <div className="mt-2 pt-2 border-t space-y-1">
                        <div className="font-semibold">{`Epoch ${hoverEpoch.epochId}`}</div>
                        <div className="opacity-80">
                          {fmtDate(hoverEpoch.startedAt)} →{' '}
                          {hoverEpoch.endedAt ? fmtDate(hoverEpoch.endedAt) : 'open'}
                        </div>
                        <div className="opacity-80">
                          Reason: {hoverEpoch.endedReason ?? '—'}
                        </div>
                        <div className="opacity-80">
                          Flags: {(hoverEpoch.triggerFlags ?? []).join(', ') || '—'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm opacity-70">
                Trend not available yet (seed trades + refresh).
              </div>
            )}
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
                  <div className="p-3 rounded-md bg-black/5">Discipline: {data.atx.subscores.discipline}</div>
                  <div className="p-3 rounded-md bg-black/5">Risk Integrity: {data.atx.subscores.riskIntegrity}</div>
                  <div className="p-3 rounded-md bg-black/5">Execution Stability: {data.atx.subscores.executionStability}</div>
                  <div className="p-3 rounded-md bg-black/5">Behavioural Volatility: {data.atx.subscores.behaviouralVolatility}</div>
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

                  {(() => {
                    const bullets = data.commentary?.bulletPoints ?? data.commentary?.bullets ?? [];
                    return bullets.length ? (
                      <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                        {bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Protected>
  );
}

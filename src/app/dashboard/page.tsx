'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { MaturityBadge, type ATXMaturity } from '@/components/MaturityBadge';
import { Sparkline } from '@/components/Sparkline';

type Account = {
  accountId: number;
  name: string;
  createdAt: number;
};

type AccountsResponse = { accounts: Account[] };
type CreateAccountResponse = { account: Account };

type ObservationStats = {
  totalTrades: number;
  closedTrades: number;
  activeDays: number;
};

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

type EpochEvent = {
  epochId: number;
  startedAt: number;
  endedAt: number | null;
  triggerFlags: string[];
  endedReason?: string | null;
  startedATX?: ATXSnapshot | null;
  endedATX?: ATXSnapshot | null;
  createdAt: number;
  provisional?: boolean;
  state?: 'detected' | 'confirmed' | string;
  confirmedAt?: number | null;
};

type ATXResponse = {
  accountId: number;
  sources: string[] | null;
  tradeCount: number;
  timeframe: 'epoch' | 'weekly' | 'monthly' | 'daily' | string;
  epoch?: { epochId: number; startedAt: number };
  atx: ATXSnapshot;
  commentary?: {
    summary: string;
    bulletPoints?: string[];
    bullets?: string[];
    reflectionQuestions?: string[];
  };
  epochs?: EpochEvent[];
  observation?: ObservationStats;
  maturity?: ATXMaturity;
  baselineLocked?: boolean;
};

type TrendPoint = {
  startedAt: number;
  label?: string;
  tradeCount?: number;
  score?: number;
  subscores?: ATXSnapshot['subscores'];
  flags?: string[];
  profiles?: string[];
  atx?: ATXSnapshot;
};

type TrendResponse = {
  accountId: number;
  interval: 'daily' | 'weekly' | 'monthly' | string;
  sources: string[] | null;
  points: TrendPoint[];
  bySource: Array<{ source: string; points: TrendPoint[] }>;
  seriesBySource: Record<string, TrendPoint[]>;
  digest?: {
    summary: string;
    topDriver: string | null;
    keySignals: string[];
    watchList: string[];
  };
  epochs: EpochEvent[];
  observation?: ObservationStats;
  maturity?: ATXMaturity;
  baselineLocked?: boolean;
  baseline?: { epochId: number; lockedAt: number | null } | null;
};

type CalendarDay = {
  date: string; // YYYY-MM-DD
  hasEntry: boolean;
  types: string[];
  hasTrades?: boolean;
  tradeCount?: number;
  sources?: string[];
};

type CalendarResponse = {
  accountId: number;
  month: string; // YYYY-MM
  days: CalendarDay[];
};


type LinkedAccount = {
  id: number;
  accountId: number;
  sourceKey: string;
  platform: string;
  externalAccountId: string;
  label: string;
  createdAt: number;
  lastSyncedAt?: number | null;
  lastTradeTimestamp?: number | null;
  tradeCount?: number;
};

type LinkedAccountsResponse = { accountId: number; linkedAccounts: LinkedAccount[] };

type CTraderTradingAccount = {
  accountId: number;
  brokerName: string;
  currency: string;
  leverage: number;
  isLive: boolean;
};

type CTraderAccountsResponse = { accounts: CTraderTradingAccount[] };

type CTraderStatusResponse = { connected: boolean; expiresAt: number | null; expiresInMs: number | null };

type SyncLinkedResponse = {
  accountId: number;
  linkedAccountId: number;
  sourceKey: string;
  fetched: number;
  mapped: number;
  status: string;
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

function fmtDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return String(ms);
  }
}

function timeAgo(ms: number | null | undefined) {
  if (!ms || !Number.isFinite(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 45) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

function isoDay(ms: number) {
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function yyyymmFromIsoDay(d: string) {
  return d.slice(0, 7);
}

function nowYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function prevYYYYMM(yyyymm: string) {
  const [y, m] = yyyymm.split('-').map((n) => Number(n));
  const dt = new Date(Date.UTC(y, (m - 1) - 1, 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
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

type SubscoreKey = keyof ATXSnapshot['subscores'];
type MetricKey = 'score' | SubscoreKey;

const SUBSCORE_KEYS: SubscoreKey[] = [
  'discipline',
  'riskIntegrity',
  'executionStability',
  'behaviouralVolatility',
  'consistency'
];

function metricLabel(k: MetricKey) {
  switch (k) {
    case 'score':
      return 'ATX';
    case 'discipline':
      return 'Discipline';
    case 'riskIntegrity':
      return 'Risk integrity';
    case 'executionStability':
      return 'Execution stability';
    case 'behaviouralVolatility':
      return 'Behavioural volatility';
    case 'consistency':
      return 'Consistency';
  }
}

function getPointATX(p: TrendPoint): ATXSnapshot | null {
  if (p.atx && typeof p.atx.score === 'number') return p.atx;
  if (typeof p.score === 'number' && p.subscores) {
    return {
      score: p.score,
      subscores: p.subscores,
      flags: p.flags ?? [],
      profiles: p.profiles ?? []
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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function buildPath(points: Array<{ x: number; y: number }>) {
  let d = '';
  for (const p of points) {
    if (!d) d = `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    else d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return d;
}

function friendlyEpochLabel(e: EpochEvent) {
  const flags = (e.triggerFlags ?? []).join(', ');
  if (e.endedReason) return e.endedReason;
  if (flags.includes('RISK_INTEGRITY_LOW') && flags.includes('BEHAVIOURAL_VOLATILITY_HIGH')) {
    return 'Risk integrity + behavioural volatility event';
  }
  if (flags.includes('RISK_INTEGRITY_LOW')) return 'Risk integrity disruption';
  if (flags.includes('DISCIPLINE_LOW')) return 'Discipline disruption';
  if (flags.includes('BEHAVIOURAL_VOLATILITY_HIGH')) return 'Behavioural volatility spike';
  return flags ? 'Behavioural phase shift' : 'Epoch shift';
}

function pct(n: number) {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  // sources filter for overall ATX/trend call ("" = all)
  const [sourceKey, setSourceKey] = useState<string>('');

  const [timeframe, setTimeframe] = useState<'epoch' | 'weekly' | 'monthly'>('epoch');

  // chart overlays
  const [showSources, setShowSources] = useState<boolean>(true);
  const [overlaySubs, setOverlaySubs] = useState<Record<MetricKey, boolean>>({
    score: false,
    discipline: false,
    riskIntegrity: false,
    executionStability: false,
    behaviouralVolatility: false,
    consistency: false
  });

  const [data, setData] = useState<ATXResponse | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);

  const [calendar28, setCalendar28] = useState<
    Array<{ date: string; tradeCount: number; sources: string[]; hasEntry: boolean; types: string[] }>
  >([]);


  // Linked accounts (multi-source observability)
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linkedErr, setLinkedErr] = useState<string | null>(null);
  const [linkedLoading, setLinkedLoading] = useState<boolean>(false);

  const [ctraderAccounts, setCTraderAccounts] = useState<CTraderTradingAccount[] | null>(null);
  const [ctraderErr, setCTraderErr] = useState<string | null>(null);
  const [ctraderLoading, setCTraderLoading] = useState<boolean>(false);
  const [ctraderStatus, setCTraderStatus] = useState<CTraderStatusResponse | null>(null);
  const [selectedCTraderAccountId, setSelectedCTraderAccountId] = useState<string>('');
  const [linking, setLinking] = useState<boolean>(false);
  const [syncingByLinkedId, setSyncingByLinkedId] = useState<Record<number, boolean>>({});

  const [editingLinkedId, setEditingLinkedId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>('');

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
    const picked = (stored && accs.find((a) => a.accountId === stored)?.accountId) || accs[0].accountId;

    setAccountId(picked);
    setStoredAccountId(picked);
  }

  useEffect(() => {
    ensureAccounts().catch((e) => setErr(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function loadLinkedAccounts() {
    if (!accountId) return;
    setLinkedLoading(true);
    setLinkedErr(null);
    try {
      const res = await apiFetch<LinkedAccountsResponse>(`/accounts/${accountId}/linked-accounts`, { auth: true });
      setLinkedAccounts(res.linkedAccounts || []);
    } catch (e: any) {
      setLinkedErr(toDisplayString(e));
      setLinkedAccounts([]);
    } finally {
      setLinkedLoading(false);
    }
  }

  async function loadCTraderAccounts() {
    setCTraderLoading(true);
    setCTraderErr(null);
    try {
      const res = await apiFetch<CTraderAccountsResponse>('/ctrader/accounts', { auth: true });
      const accs = res.accounts || [];
      setCTraderAccounts(accs);
      if (accs.length && !selectedCTraderAccountId) {
        setSelectedCTraderAccountId(String(accs[0].accountId));
      }
    } catch (e: any) {
      setCTraderAccounts(null);
      setCTraderErr(toDisplayString(e));
    } finally {
      setCTraderLoading(false);
    }
  }


  async function loadCTraderStatus() {
    try {
      const s = await apiFetch<CTraderStatusResponse>('/ctrader/status', { auth: true });
      setCTraderStatus(s);
    } catch {
      setCTraderStatus(null);
    }
  }

  async function disconnectCTrader() {
    try {
      await apiFetch('/ctrader/disconnect', { method: 'POST', auth: true });
      setCTraderStatus({ connected: false, expiresAt: null, expiresInMs: null });
      setCTraderAccounts(null);
      setSelectedCTraderAccountId('');
    } catch (e: any) {
      setCTraderErr(toDisplayString(e));
    }
  }

  async function syncLinked(linkedId: number) {
    if (!accountId || !linkedId) return;
    setSyncingByLinkedId((m) => ({ ...m, [linkedId]: true }));
    try {
      await apiFetch<SyncLinkedResponse>(`/accounts/${accountId}/linked-accounts/${linkedId}/sync`, {
        method: 'POST',
        auth: true
      });
      await loadLinkedAccounts();
      await loadATX();
      await loadTrend();
      await loadHeatmap28();
    } catch (e: any) {
      setLinkedErr(toDisplayString(e));
    } finally {
      setSyncingByLinkedId((m) => ({ ...m, [linkedId]: false }));
    }
  }


  async function renameLinked(linkedId: number, label: string) {
    if (!accountId || !linkedId) return;
    const trimmed = label.trim();
    if (!trimmed) return;

    try {
      await apiFetch(`/accounts/${accountId}/linked-accounts/${linkedId}`, {
        method: 'PATCH',
        auth: true,
        body: { label: trimmed }
      });
      setEditingLinkedId(null);
      setEditingLabel('');
      await loadLinkedAccounts();
    } catch (e: any) {
      setLinkedErr(toDisplayString(e));
    }
  }

  async function unlinkLinked(linkedId: number) {
    if (!accountId || !linkedId) return;
    try {
      await apiFetch(`/accounts/${accountId}/linked-accounts/${linkedId}`, { method: 'DELETE', auth: true });
      await loadLinkedAccounts();
      const removed = linkedAccounts.find((x) => x.id === linkedId);
      if (removed && sourceKey === removed.sourceKey) setSourceKey('');
    } catch (e: any) {
      setLinkedErr(toDisplayString(e));
    }
  }

  async function linkAndSyncSelectedCTrader() {
    if (!accountId) return;
    const extId = selectedCTraderAccountId.trim();
    if (!extId) return;

    const meta = (ctraderAccounts || []).find((a) => String(a.accountId) === extId) || null;
    const label = meta
      ? `cTrader ${meta.brokerName}${meta.isLive ? ' LIVE' : ''} • ${meta.accountId}`
      : `cTrader • ${extId}`;

    setLinking(true);
    setLinkedErr(null);
    try {
      const created = await apiFetch<any>(`/accounts/${accountId}/linked-accounts`, {
        method: 'POST',
        auth: true,
        body: { platform: 'ctrader', externalAccountId: extId, label }
      });

      const linkedId = Number(created?.linkedAccount?.id ?? 0);
      if (linkedId) {
        await apiFetch<SyncLinkedResponse>(`/accounts/${accountId}/linked-accounts/${linkedId}/sync`, {
          method: 'POST',
          auth: true
        });
      }

      await loadLinkedAccounts();
      await loadATX();
      await loadTrend();
      await loadHeatmap28();
    } catch (e: any) {
      setLinkedErr(toDisplayString(e));
    } finally {
      setLinking(false);
    }
  }

  useEffect(() => {
    if (!accountId) return;
    loadLinkedAccounts();
    loadCTraderStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);


  async function loadATX() {
    if (!accountId) return;

    setLoading(true);
    setErr(null);
    setSeedInfo(null);
    setData(null);
    setDebugPayload(null);

    try {
      const qs = new URLSearchParams();
      qs.set('timeframe', timeframe);
      if (sourceKey) qs.set('sources', sourceKey);

      const res = await apiFetch<unknown>(`/atx/accounts/${accountId}?${qs.toString()}`, { auth: true });

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
      const qs = new URLSearchParams();
      qs.set('interval', 'daily');
      qs.set('limit', '180');
      if (sourceKey) qs.set('sources', sourceKey);

      const res = await apiFetch<TrendResponse>(`/atx/accounts/${accountId}/trend?${qs.toString()}`, { auth: true });
      setTrend(res);

      // If the selected sourceKey is no longer present (e.g., after reseed), reset.
      if (sourceKey) {
        const keys = Object.keys(res.seriesBySource ?? {});
        if (keys.length && !keys.includes(sourceKey)) setSourceKey('');
      }
    } catch (e) {
      console.warn('Trend load failed:', e);
      setTrend(null);
    }
  }

  async function loadHeatmap28() {
    if (!accountId) return;

    try {
      const m0 = nowYYYYMM();
      const m1 = prevYYYYMM(m0);
      const [c0, c1] = await Promise.all([
        apiFetch<CalendarResponse>(`/journal/accounts/${accountId}/calendar?month=${m0}`, { auth: true }),
        apiFetch<CalendarResponse>(`/journal/accounts/${accountId}/calendar?month=${m1}`, { auth: true })
      ]);

      const map = new Map<string, { tradeCount: number; sources: string[]; hasEntry: boolean; types: string[] }>();

      const ingest = (cal: CalendarResponse) => {
        for (const d of cal.days ?? []) {
          const count = Number(d.tradeCount ?? 0) || 0;
          const sources = Array.isArray(d.sources) ? d.sources.map(String) : [];
          const hasEntry = Boolean((d as any).hasEntry);
          const types = Array.isArray((d as any).types) ? (d as any).types.map(String) : [];

          if (!map.has(d.date)) {
            map.set(d.date, { tradeCount: count, sources, hasEntry, types });
          } else {
            const prev = map.get(d.date)!;
            map.set(d.date, {
              tradeCount: prev.tradeCount + count,
              sources: Array.from(new Set([...prev.sources, ...sources])).sort(),
              hasEntry: prev.hasEntry || hasEntry,
              types: Array.from(new Set([...(prev.types ?? []), ...types])).sort()
            });
          }
        }
      };

      ingest(c0);
      ingest(c1);

      // Build last 28 days from today (UTC day labels)
      const today = new Date();
      const out: Array<{ date: string; tradeCount: number; sources: string[]; hasEntry: boolean; types: string[] }> = [];
      for (let i = 27; i >= 0; i--) {
        const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
        const date = dt.toISOString().slice(0, 10);
        const entry = map.get(date);
        out.push({
          date,
          tradeCount: entry?.tradeCount ?? 0,
          sources: entry?.sources ?? [],
          hasEntry: entry?.hasEntry ?? false,
          types: entry?.types ?? []
        });
      }

      setCalendar28(out);
    } catch (e) {
      console.warn('Heatmap load failed:', e);
      setCalendar28([]);
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
      await Promise.all([loadATX(), loadTrend(), loadHeatmap28()]);
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
    loadHeatmap28();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, sourceKey, timeframe]);

  const availableSourceKeys = useMemo(() => {
    const keys = Object.keys(trend?.seriesBySource ?? {});
    if (keys.length) return keys.sort();
    // fallback for early states
    return ['mock:default', 'live:default'];
  }, [trend]);

  const latestPoint = useMemo(() => {
    const pts = trend?.points ?? [];
    return pts.length ? pts[pts.length - 1] : null;
  }, [trend]);

  const previousPoint = useMemo(() => {
    const pts = trend?.points ?? [];
    return pts.length >= 2 ? pts[pts.length - 2] : null;
  }, [trend]);

  const topDriver = useMemo(() => {
    const a = latestPoint ? getPointATX(latestPoint) : null;
    const b = previousPoint ? getPointATX(previousPoint) : null;
    if (!a || !b) return null;

    let best: { k: SubscoreKey; delta: number } | null = null;
    for (const k of SUBSCORE_KEYS) {
      const da = a.subscores[k];
      const db = b.subscores[k];
      const delta = Math.round((da - db) * 1);
      const abs = Math.abs(delta);
      if (!best || abs > Math.abs(best.delta)) best = { k, delta };
    }

    if (!best) return null;

    const dir = best.delta >= 0 ? 'increased' : 'decreased';
    const signed = best.delta >= 0 ? `+${best.delta}` : String(best.delta);

    return {
      text: `Top driver: ${metricLabel(best.k)} ${dir} (${signed}) versus the prior observation.`,
      key: best.k,
      delta: best.delta
    };
  }, [latestPoint, previousPoint]);

  const observationLine = useMemo(() => {
    const obs = trend?.observation ?? data?.observation;
    if (!obs) return null;
    return `${obs.totalTrades} trades • ${obs.activeDays} active days`;
  }, [trend, data]);

  const keySignals = useMemo(() => {
    const fromDigest = trend?.digest?.keySignals;
    if (Array.isArray(fromDigest) && fromDigest.length) return fromDigest.slice(0, 3);

    const a = data?.atx;
    if (!a) return [] as string[];

    const bullets: string[] = [];

    if (a.flags?.includes('INSUFFICIENT_DATA')) {
      bullets.push('Observation is early — signals may be noisy until a baseline forms.');
    }

    if (a.flags?.includes('RISK_INTEGRITY_LOW')) bullets.push('Risk integrity is below the stable range.');
    else if (a.subscores.riskIntegrity >= 70) bullets.push('Risk integrity is holding in a strong range.');

    if (a.flags?.includes('DISCIPLINE_LOW')) bullets.push('Discipline stability is under pressure.');
    else if (a.subscores.discipline >= 70) bullets.push('Discipline is holding in a strong range.');

    if (a.flags?.includes('BEHAVIOURAL_VOLATILITY_HIGH')) bullets.push('Behavioural volatility is elevated.');
    else if (a.subscores.behaviouralVolatility <= 50) bullets.push('Behavioural volatility is contained.');

    return bullets.slice(0, 3);
  }, [data, trend]);

  const watchList = useMemo(() => {
    const w = trend?.digest?.watchList;
    return Array.isArray(w) ? w.slice(0, 3) : [];
  }, [trend]);

  const digestSummary = useMemo(() => {
    const s = trend?.digest?.summary;
    return typeof s === 'string' && s.trim().length ? s.trim() : null;
  }, [trend]);

  const topDriverText = useMemo(() => {
    const t = trend?.digest?.topDriver;
    if (typeof t === 'string' && t.trim().length) return `Top driver: ${t.trim()}.`;
    return topDriver?.text ?? null;
  }, [trend, topDriver]);

  const actionable = useMemo(() => {
    const pts = (trend?.points ?? []).map((p) => getPointATX(p)).filter(Boolean) as ATXSnapshot[];
    if (!pts.length) return null;

    // Evaluate last 14 daily observations
    const tail = pts.slice(-14);

    const disciplineGood = (x: ATXSnapshot) => x.subscores.discipline >= 60 && !x.flags.includes('DISCIPLINE_LOW');
    const riskGood = (x: ATXSnapshot) => x.subscores.riskIntegrity >= 60 && !x.flags.includes('RISK_INTEGRITY_LOW');
    const calmGood = (x: ATXSnapshot) => x.subscores.behaviouralVolatility <= 60 && !x.flags.includes('BEHAVIOURAL_VOLATILITY_HIGH');

    // Streak: consecutive good discipline days from latest backwards
    let streak = 0;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (disciplineGood(pts[i])) streak++;
      else break;
    }

    const riskRate = tail.length ? tail.filter(riskGood).length / tail.length : 0;
    const calmRate = tail.length ? tail.filter(calmGood).length / tail.length : 0;

    // "Instability" days: any day with a core disruption flag
    const instability = tail.filter((x) =>
      x.flags.includes('DISCIPLINE_LOW') || x.flags.includes('RISK_INTEGRITY_LOW') || x.flags.includes('BEHAVIOURAL_VOLATILITY_HIGH')
    ).length;

    return {
      disciplineStreakDays: streak,
      riskCompliance14d: riskRate,
      calmDays14d: calmRate,
      instabilityDays14d: instability
    };
  }, [trend]);

  const epochSummary = useMemo(() => {
    const epochs = (trend?.epochs ?? data?.epochs ?? []).slice().sort((a, b) => b.startedAt - a.startedAt);
    const last = epochs[0] ?? null;
    if (!last) return null;

    const pts = trend?.points ?? [];
    const latest = pts.length ? getPointATX(pts[pts.length - 1]) : null;

    // Estimate epoch start score from first point at/after epoch start
    const startPoint = pts.find((p) => (p.startedAt ?? 0) >= last.startedAt) ?? null;
    const startATX = startPoint ? getPointATX(startPoint) : null;

    const delta = latest && startATX ? Math.round(latest.score - startATX.score) : null;

    return {
      epoch: last,
      label: friendlyEpochLabel(last),
      delta
    };
  }, [trend, data]);

  const baselineCompare = useMemo(() => {
    const base = trend?.baseline;
    const epochs = trend?.epochs ?? [];
    const pts = trend?.points ?? [];
    if (!base || !pts.length) return null;
    const epoch = epochs.find((e) => e.epochId === base.epochId) ?? null;
    if (!epoch) return null;

    const start = Number(epoch.startedAt ?? 0);
    const end = epoch.endedAt ? Number(epoch.endedAt) : Number.POSITIVE_INFINITY;
    const inEpoch = pts.filter((p) => {
      const t = Number(p.startedAt ?? 0);
      return t >= start && t < end;
    });
    const scores = inEpoch
      .map((p) => getMetricValueFromPoint(p, 'score'))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (scores.length < 3) return null;

    const baselineAvg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const latest = getMetricValueFromPoint(pts[pts.length - 1], 'score');
    if (typeof latest !== 'number' || !Number.isFinite(latest)) return null;
    const latestRounded = Math.round(latest);

    return {
      epoch,
      baselineAvg,
      latest: latestRounded,
      delta: Math.round(latestRounded - baselineAvg),
      lockedAt: base.lockedAt ?? null
    };
  }, [trend]);

  const sourcePanel = useMemo(() => {
    const series = trend?.seriesBySource ?? {};
    const keys = Object.keys(series);
    if (!keys.length) return [] as Array<{ source: string; latestScore: number | null; trades7d: number; avg7d: number | null }>;

    const rows = keys
      .sort()
      .map((source) => {
        const pts = series[source] ?? [];
        const last = pts.length ? getPointATX(pts[pts.length - 1]) : null;
        const tail = pts.slice(-7);
        const atxTail = tail.map((p) => getPointATX(p)).filter(Boolean) as ATXSnapshot[];

        const avg7d = atxTail.length ? atxTail.reduce((s, x) => s + x.score, 0) / atxTail.length : null;
        const trades7d = tail.reduce((s, p) => s + (Number(p.tradeCount ?? 0) || 0), 0);

        return {
          source,
          latestScore: last ? Math.round(last.score) : null,
          trades7d,
          avg7d: avg7d == null ? null : Math.round(avg7d)
        };
      });

    return rows;
  }, [trend]);

  const bestWorstSource = useMemo(() => {
    if (!sourcePanel.length) return null;
    const scored = sourcePanel.filter((r) => typeof r.avg7d === 'number') as Array<{ source: string; avg7d: number; latestScore: number | null; trades7d: number }>;
    if (!scored.length) return null;
    const best = scored.slice().sort((a, b) => b.avg7d - a.avg7d)[0];
    const worst = scored.slice().sort((a, b) => a.avg7d - b.avg7d)[0];
    return { best, worst };
  }, [sourcePanel]);

  const chart = useMemo(() => {
    const pts = (trend?.points ?? []).filter((p) => typeof p.startedAt === 'number');
    if (pts.length < 2) return null;

    const xsW = 980;
    const ysH = 300;
    const pad = 32;

    const minTs = pts[0].startedAt;
    const maxTs = pts[pts.length - 1].startedAt;
    const spanTs = Math.max(1, maxTs - minTs);

    // Fixed 0..100 scale (institutional: stable, avoids exaggerating noise)
    const xForTs = (ts: number) => pad + ((ts - minTs) / spanTs) * (xsW - pad * 2);
    const yForV = (v: number) => pad + (1 - clamp(v, 0, 100) / 100) * (ysH - pad * 2);

    const mainValues = pts.map((p) => getMetricValueFromPoint(p, 'score'));
    const mainPts = pts
      .map((p, i) => {
        const v = mainValues[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        return { x: xForTs(p.startedAt), y: yForV(v), ts: p.startedAt, p, v };
      })
      .filter(Boolean) as Array<{ x: number; y: number; ts: number; p: TrendPoint; v: number }>;

    if (mainPts.length < 2) return null;

    const mainPath = buildPath(mainPts);

    // Subscore overlays
    const overlayPaths: Array<{ key: MetricKey; d: string; dash: string; opacity: number }> = [];
    const dashByKey: Record<string, string> = {
      discipline: '5 4',
      riskIntegrity: '3 5',
      executionStability: '8 4',
      behaviouralVolatility: '2 6',
      consistency: '1 5'
    };

    for (const k of SUBSCORE_KEYS) {
      if (!overlaySubs[k]) continue;
      const vals = pts.map((p) => getMetricValueFromPoint(p, k));
      const oPts = pts
        .map((p, i) => {
          const v = vals[i];
          if (typeof v !== 'number' || !Number.isFinite(v)) return null;
          return { x: xForTs(p.startedAt), y: yForV(v) };
        })
        .filter(Boolean) as Array<{ x: number; y: number }>;
      if (oPts.length >= 2) {
        overlayPaths.push({ key: k, d: buildPath(oPts), dash: dashByKey[k] || '4 4', opacity: 0.55 });
      }
    }

    // Per-source lines
    const sourcePaths: Array<{ source: string; d: string; dash: string; opacity: number }> = [];
    if (showSources) {
      const series = trend?.seriesBySource ?? {};
      const keys = Object.keys(series).sort();
      const dashCycle = ['10 6', '6 6', '4 8', '2 6'];

      keys.forEach((source, idx) => {
        const sPts = series[source] ?? [];
        const vals = sPts.map((p) => getMetricValueFromPoint(p, 'score'));
        const xy = sPts
          .map((p, i) => {
            const v = vals[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) return null;
            const ts = p.startedAt;
            if (ts < minTs || ts > maxTs) return null;
            return { x: xForTs(ts), y: yForV(v) };
          })
          .filter(Boolean) as Array<{ x: number; y: number }>;
        if (xy.length >= 2) {
          sourcePaths.push({ source, d: buildPath(xy), dash: dashCycle[idx % dashCycle.length], opacity: 0.35 });
        }
      });
    }

    const epochs = (trend?.epochs ?? []).slice();
    const epochLines = epochs
      .map((e) => ({
        epoch: e,
        x: xForTs(clamp(e.startedAt, minTs, maxTs))
      }))
      .sort((a, b) => a.x - b.x);

    const epochRects = epochs
      .map((e) => {
        const x0 = xForTs(clamp(e.startedAt, minTs, maxTs));
        const endTs = e.endedAt == null ? maxTs : clamp(e.endedAt, minTs, maxTs);
        const x1 = xForTs(endTs);
        const w = Math.max(0, x1 - x0);
        return { epoch: e, x: x0, w };
      })
      .filter((r) => r.w > 0);

    return {
      svg: { w: xsW, h: ysH, pad },
      minTs,
      maxTs,
      mainPts,
      mainPath,
      overlayPaths,
      sourcePaths,
      epochLines,
      epochRects
    };
  }, [trend, overlaySubs, showSources]);

  const hoverPoint = useMemo(() => {
    if (!chart || hoverIdx == null) return null;
    const item = chart.mainPts[hoverIdx];
    return item ?? null;
  }, [chart, hoverIdx]);

  const hoverEpoch = useMemo(() => {
    if (!trend || hoverEpochId == null) return null;
    return (trend.epochs ?? []).find((e) => e.epochId === hoverEpochId) ?? null;
  }, [trend, hoverEpochId]);

  function onChartMove(ev: MouseEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = (ev.currentTarget as any).getBoundingClientRect?.();
    if (!rect) return;

    const relX = ev.clientX - rect.left;
    const viewX = (relX / rect.width) * chart.svg.w;

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < chart.mainPts.length; i++) {
      const dx = Math.abs(chart.mainPts[i].x - viewX);
      if (dx < bestDist) {
        bestDist = dx;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  }

  const sourceLegend = useMemo(() => {
    const series = trend?.seriesBySource ?? {};
    const keys = Object.keys(series).sort();
    return keys;
  }, [trend]);

  return (
    <Protected>
      <div className="min-h-screen p-6 bg-gradient-to-b from-neutral-950 to-neutral-900 text-white">
        <div className="max-w-6xl mx-auto space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-sm text-white/60">API: {process.env.NEXT_PUBLIC_API_BASE_URL || '(missing)'}</p>
            </div>

            <button
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
              onClick={() => {
                clearToken();
                router.push('/login');
              }}
            >
              Logout
            </button>
          </header>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="text-xs opacity-60 mb-1">Account</div>
              <select
                className="w-full rounded-xl border border-white/15 bg-white/5 p-2 text-sm text-white"
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

            <div className="p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="text-xs opacity-60 mb-1">Source filter</div>
              <select
                className="w-full rounded-xl border border-white/15 bg-white/5 p-2 text-sm text-white"
                value={sourceKey}
                onChange={(e) => setSourceKey(String(e.target.value))}
                title="Filter ATX and trend to a single source. Leave as All to show overall + per-source lines."
              >
                <option value="">All sources</option>
                {availableSourceKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="text-xs opacity-60 mb-1">Timeframe</div>
              <select
                className="w-full rounded-xl border border-white/15 bg-white/5 p-2 text-sm text-white"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as any)}
              >
                <option value="epoch">epoch</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </div>

            <div className="p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="text-xs opacity-60 mb-1">Chart</div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={showSources} onChange={(e) => setShowSources(e.target.checked)} />
                  <span className="opacity-80">Per-source lines</span>
                </label>
                <button
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 text-sm"
                  onClick={() => {
                    loadATX();
                    loadTrend();
                    loadHeatmap28();
                  }}
                  disabled={loading || !accountId}
                >
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
              onClick={seedMockTrades}
              disabled={loading || !accountId}
              title="Seeds mock trades then refreshes dashboard"
            >
              Seed mock trades
            </button>

            <button className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" onClick={() => router.push('/journal')}>
              Journal
            </button>
          </div>

          {seedInfo && !errText && (
            <div className="p-3 rounded-2xl border border-green-400/30 bg-green-500/10 text-green-100">{seedInfo}</div>
          )}

          {errText && (
            <div className="p-3 rounded-2xl border border-red-400/30 bg-red-500/10 text-red-100">
              <div className="font-semibold mb-2">Error</div>
              <pre className="text-xs whitespace-pre-wrap">{errText}</pre>
            </div>
          )}

          {debugPayload != null && (
            <div className="p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="font-semibold mb-2">Debug: raw response</div>
              <pre className="text-xs whitespace-pre-wrap">{toDisplayString(debugPayload)}</pre>
            </div>
          )}

          {/* Top row: ATX + Observation Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs opacity-60">Current ATX</div>
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-semibold">{data?.atx?.score ?? '—'}</div>
                    <MaturityBadge maturity={data?.maturity ?? trend?.maturity} baselineLocked={data?.baselineLocked ?? trend?.baselineLocked} />
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {observationLine ? `Observed: ${observationLine}` : 'ATX updates daily and becomes more reliable as Auric observes behaviour across time and market conditions.'}
                  </div>
                  {digestSummary ? (
                    <div className="mt-2 text-sm text-white/80">
                      {digestSummary}
                    </div>
                  ) : null}
                </div>

                <div className="text-sm opacity-70">
                  Trades: <span className="font-semibold">{data?.tradeCount ?? '—'}</span>
                </div>
              </div>

              {keySignals.length ? (
                <div className="mt-3">
                  <div className="text-xs opacity-60 mb-1">Key signals observed</div>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {keySignals.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {topDriverText ? <div className="mt-3 text-sm text-white/80">{topDriverText}</div> : null}

              {watchList.length ? (
                <div className="mt-3">
                  <div className="text-xs opacity-60 mb-1">Watch list (non-directive)</div>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {watchList.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="font-semibold">Observation Summary</div>
              <div className="text-xs opacity-60">Confidence grows with observation history.</div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-xs opacity-60">Active days</div>
                  <div className="font-semibold">{trend?.observation?.activeDays ?? data?.observation?.activeDays ?? '—'}</div>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-xs opacity-60">Trades observed</div>
                  <div className="font-semibold">{trend?.observation?.totalTrades ?? data?.observation?.totalTrades ?? '—'}</div>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-xs opacity-60">Closed trades</div>
                  <div className="font-semibold">{trend?.observation?.closedTrades ?? data?.observation?.closedTrades ?? '—'}</div>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-xs opacity-60">Baseline</div>
                  <div className="font-semibold">{(data?.baselineLocked ?? trend?.baselineLocked) ? 'Locked' : 'Forming'}</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>Observation maturity</span>
                  <span>{(trend?.maturity ?? data?.maturity)?.label ?? '—'}</span>
                </div>
                {(() => {
                  const band = (trend?.maturity ?? data?.maturity)?.band ?? 'initial';
                  const steps: Array<{ k: 'initial' | 'developing' | 'established'; label: string }> = [
                    { k: 'initial', label: 'Initial' },
                    { k: 'developing', label: 'Developing' },
                    { k: 'established', label: 'Established' }
                  ];
                  const idx = steps.findIndex((s) => s.k === band);
                  return (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {steps.map((s, i) => (
                        <div
                          key={s.k}
                          className={[
                            'rounded-xl border px-2 py-2 text-[11px]',
                            i <= idx ? 'bg-white text-black border-white/20' : 'bg-white/5 text-white/60 border-white/10'
                          ].join(' ')}
                        >
                          {s.label}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {baselineCompare ? (
                <div className="mt-3 p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-xs text-white/60">Baseline epoch (locked)</div>
                  <div className="mt-1 text-sm">
                    Avg: <span className="font-semibold">{baselineCompare.baselineAvg}</span> • Current:{' '}
                    <span className="font-semibold">{baselineCompare.latest}</span> • Δ{' '}
                    <span className="font-semibold">{baselineCompare.delta >= 0 ? `+${baselineCompare.delta}` : baselineCompare.delta}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/60">
                    Epoch {baselineCompare.epoch.epochId} • Locked{' '}
                    {baselineCompare.lockedAt ? `(${fmtDate(baselineCompare.lockedAt)})` : ''}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 text-xs opacity-70">
                Early ATX is an initial signal. Interpretation becomes stable as Auric observes more behaviour across time and market conditions.
              </div>
            </div>
          </div>

          {/* Epoch strip + chart */}
          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">ATX Trend</div>
                <div className="text-xs opacity-60">Daily observation series (0–100 scale)</div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <label className="text-xs flex items-center gap-2" title="Overlay subscores on the main ATX line">
                  <span className="opacity-70">Overlays</span>
                </label>
                {SUBSCORE_KEYS.map((k) => (
                  <button
                    key={k}
                    className={[
                      'px-3 py-1.5 rounded-xl border text-xs transition',
                      overlaySubs[k]
                        ? 'bg-white text-black border-white/20'
                        : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                    ].join(' ')}
                    onClick={() => setOverlaySubs((s) => ({ ...s, [k]: !s[k] }))}
                    disabled={!trend?.points?.length}
                  >
                    {metricLabel(k)}
                  </button>
                ))}
              </div>
            </div>

            {epochSummary ? (
              <div className="p-3 rounded-xl border border-white/10 bg-white/5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="opacity-70">Last shift:</span>{' '}
                  <span className="font-semibold">{epochSummary.label}</span>{' '}
                  <span className="opacity-60">({fmtDate(epochSummary.epoch.startedAt)})</span>
                  {epochSummary.epoch.provisional ? (
                    <span
                      className="ml-2 px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[11px] text-white/80"
                      title="Detected shift — will confirm once baseline and recovery are observed"
                    >
                      detected
                    </span>
                  ) : (
                    <span
                      className="ml-2 px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[11px] text-white/80"
                      title="Confirmed shift"
                    >
                      confirmed
                    </span>
                  )}
                </div>
                <div className="text-sm opacity-80">
                  {epochSummary.delta == null ? (
                    <span>Recovery: —</span>
                  ) : (
                    <span>
                      Recovery: <span className="font-semibold">{epochSummary.delta >= 0 ? `+${epochSummary.delta}` : epochSummary.delta}</span> since epoch start
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {chart ? (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${chart.svg.w} ${chart.svg.h}`}
                  className="w-full h-[300px] select-none"
                  onMouseMove={onChartMove}
                  onMouseLeave={() => {
                    setHoverIdx(null);
                    setHoverEpochId(null);
                  }}
                >
                  {/* Epoch shaded regions */}
                  {chart.epochRects.map((r) => (
                    <rect
                      key={`epoch-rect-${r.epoch.epochId}`}
                      x={r.x}
                      y={chart.svg.pad}
                      width={r.w}
                      height={chart.svg.h - chart.svg.pad * 2}
                      opacity={0.06}
                      onMouseEnter={() => setHoverEpochId(r.epoch.epochId)}
                      onMouseLeave={() => setHoverEpochId(null)}
                    >
                      <title>
                        {`Epoch ${r.epoch.epochId}${r.epoch.provisional ? ' (provisional)' : ''}\nStarted: ${fmtDate(r.epoch.startedAt)}\nEnded: ${r.epoch.endedAt ? fmtDate(r.epoch.endedAt) : '—'}\nReason: ${r.epoch.endedReason ?? '—'}\nFlags: ${(r.epoch.triggerFlags ?? []).join(', ') || '—'}`}
                      </title>
                    </rect>
                  ))}

                  {/* Main ATX line */}
                  <path d={chart.mainPath} fill="none" strokeWidth="2" />

                  {/* Subscore overlays */}
                  {chart.overlayPaths.map((p) => (
                    <path
                      key={`overlay-${p.key}`}
                      d={p.d}
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray={p.dash}
                      opacity={p.opacity}
                    >
                      <title>{metricLabel(p.key)}</title>
                    </path>
                  ))}

                  {/* Per-source lines */}
                  {chart.sourcePaths.map((p) => (
                    <path
                      key={`source-${p.source}`}
                      d={p.d}
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray={p.dash}
                      opacity={p.opacity}
                    >
                      <title>{p.source}</title>
                    </path>
                  ))}

                  {/* Epoch start lines */}
                  {chart.epochLines.map((l) => (
                    <g key={`epoch-line-${l.epoch.epochId}`}> 
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
                          {`Epoch ${l.epoch.epochId}${l.epoch.provisional ? ' (provisional)' : ''}\nStarted: ${fmtDate(l.epoch.startedAt)}\nFlags: ${(l.epoch.triggerFlags ?? []).join(', ') || '—'}`}
                        </title>
                      </line>
                      <text x={l.x + 4} y={chart.svg.pad + 12} fontSize="10" opacity={0.7}>
                        {`E${l.epoch.epochId}`}
                      </text>
                    </g>
                  ))}

                  {/* Hover point marker */}
                  {chart.mainPts.map((p, i) => (
                    <circle
                      key={`pt-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={i === hoverIdx ? 4 : 2.5}
                      opacity={i === hoverIdx ? 0.95 : 0.55}
                    >
                      <title>{`${fmtDate(p.ts)} • ATX: ${Math.round(p.v)}`}</title>
                    </circle>
                  ))}
                </svg>

                {/* Hover tooltip */}
                {(hoverPoint || hoverEpoch) && (
                  <div className="absolute right-3 top-3 rounded-2xl border border-white/10 bg-neutral-950/90 backdrop-blur-sm p-3 text-xs text-white/90 shadow-lg max-w-[360px]">
                    {hoverPoint && (
                      <div className="space-y-1">
                        <div className="font-semibold">{fmtDate(hoverPoint.ts)}</div>
                        <div>
                          <span className="opacity-70">ATX:</span> <span className="font-semibold">{Math.round(hoverPoint.v)}</span>
                        </div>
                        {(() => {
                          const atx = getPointATX(hoverPoint.p);
                          if (!atx) return null;
                          return (
                            <div className="pt-1 space-y-0.5 opacity-80">
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <div>D: {atx.subscores.discipline}</div>
                                <div>R: {atx.subscores.riskIntegrity}</div>
                                <div>E: {atx.subscores.executionStability}</div>
                                <div>V: {atx.subscores.behaviouralVolatility}</div>
                                <div>C: {atx.subscores.consistency}</div>
                              </div>
                              {atx.flags?.length ? (
                                <div className="pt-1">
                                  <span className="opacity-70">Flags:</span> {atx.flags.join(', ')}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {showSources && sourceLegend.length ? (
                          <div className="pt-2 border-t mt-2">
                            <div className="opacity-70 mb-1">Per-source (ATX)</div>
                            <div className="space-y-0.5">
                              {sourceLegend.slice(0, 6).map((sk) => {
                                const sPts = trend?.seriesBySource?.[sk] ?? [];
                                const match = sPts.find((p) => p.startedAt === hoverPoint.ts);
                                const s = match ? getPointATX(match) : null;
                                return (
                                  <div key={sk} className="flex justify-between gap-2">
                                    <span className="opacity-80">{sk}</span>
                                    <span className="font-semibold">{s ? Math.round(s.score) : '—'}</span>
                                  </div>
                                );
                              })}
                              {sourceLegend.length > 6 ? <div className="opacity-60">…</div> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {hoverEpoch && (
                      <div className="mt-2 pt-2 border-t space-y-1">
                        <div className="font-semibold">{`Epoch ${hoverEpoch.epochId}`}</div>
                        <div className="opacity-80">
                          {fmtDate(hoverEpoch.startedAt)} → {hoverEpoch.endedAt ? fmtDate(hoverEpoch.endedAt) : 'open'}
                        </div>
                        {hoverEpoch.provisional ? <div className="opacity-80">Status: provisional</div> : <div className="opacity-80">Status: confirmed</div>}
                        <div className="opacity-80">Reason: {hoverEpoch.endedReason ?? '—'}</div>
                        <div className="opacity-80">Flags: {(hoverEpoch.triggerFlags ?? []).join(', ') || '—'}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm opacity-70">Trend not available yet (seed trades + refresh).</div>
            )}
          </div>

          {/* Subscores panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">Subscores</div>
                  <div className="text-xs opacity-60">Sparklines show recent direction (daily).</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {SUBSCORE_KEYS.map((k) => {
                  const vals = (trend?.points ?? []).map((p) => getMetricValueFromPoint(p, k));
                  const last = typeof vals[vals.length - 1] === 'number' ? Math.round(vals[vals.length - 1] as number) : null;
                  return (
                    <div key={k} className="p-3 rounded-xl border border-white/10 bg-white/5">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{metricLabel(k)}</div>
                        <div className="text-sm opacity-80">{last ?? '—'}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Sparkline values={vals.slice(-30)} className="w-full h-6" title={metricLabel(k)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="font-semibold">Behavioural indicators</div>
              <div className="text-xs opacity-60">Derived from the daily observation series.</div>

              {actionable ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                    <div className="text-xs opacity-60">Discipline streak</div>
                    <div className="font-semibold">{actionable.disciplineStreakDays}d</div>
                  </div>
                  <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                    <div className="text-xs opacity-60">Risk compliance (14d)</div>
                    <div className="font-semibold">{pct(actionable.riskCompliance14d)}</div>
                  </div>
                  <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                    <div className="text-xs opacity-60">Calm days (14d)</div>
                    <div className="font-semibold">{pct(actionable.calmDays14d)}</div>
                  </div>
                  <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                    <div className="text-xs opacity-60">Instability days (14d)</div>
                    <div className="font-semibold">{actionable.instabilityDays14d}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">Not enough observations yet.</div>
              )}

              <div className="mt-3 text-xs opacity-70">
                These indicators are monitoring aids — they are not targets. Use them to understand stability, not to chase the score.
              </div>
            </div>
          </div>


          {/* Linked accounts + AURIX readiness */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm lg:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="font-semibold">Linked accounts</div>
                  <div className="text-xs opacity-60">
                    Attach multiple platforms / accounts under one Auric account. Trades ingest per sourceKey.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10 disabled:opacity-50"
                    onClick={() => loadLinkedAccounts()}
                    disabled={linkedLoading}
                    title="Refresh linked accounts"
                  >
                    {linkedLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10 disabled:opacity-50"
                    onClick={() => loadCTraderAccounts()}
                    disabled={ctraderLoading}
                    title="Load cTrader accounts"
                  >
                    {ctraderLoading ? 'Loading cTrader…' : 'cTrader accounts'}
                  </button>
                </div>
              </div>

              {linkedErr ? <div className="mt-3 text-sm text-red-200/80">{linkedErr}</div> : null}

              {linkedAccounts.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left opacity-70">
                        <th className="py-2 pr-3">Label</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Trades</th>
                        <th className="py-2 pr-3">Last sync</th>
                        <th className="py-2 pr-0 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedAccounts.map((la) => {
                        const syncing = Boolean(syncingByLinkedId[la.id]);
                        return (
                          <tr key={la.id} className="border-t border-white/10">
                            <td className="py-2 pr-3">
                              {editingLinkedId === la.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    value={editingLabel}
                                    onChange={(e) => setEditingLabel(e.target.value)}
                                    className="px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-sm w-full sm:w-72"
                                    placeholder="Linked account label"
                                  />
                                  <button
                                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10"
                                    onClick={() => renameLinked(la.id, editingLabel)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10"
                                    onClick={() => {
                                      setEditingLinkedId(null);
                                      setEditingLabel('');
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{la.label}</span>
                                  <button
                                    className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-xs hover:bg-white/10"
                                    onClick={() => {
                                      setEditingLinkedId(la.id);
                                      setEditingLabel(la.label);
                                    }}
                                    title="Rename this linked account"
                                  >
                                    Rename
                                  </button>
                                  <span className="text-xs opacity-60">
                                    {la.platform} • {la.externalAccountId}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs">{la.sourceKey}</td>
                            <td className="py-2 pr-3">{Number(la.tradeCount ?? 0)}</td>
                            <td className="py-2 pr-3">{timeAgo(la.lastSyncedAt ?? null)}</td>
                            <td className="py-2 pr-0 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10 disabled:opacity-50"
                                  onClick={() => syncLinked(la.id)}
                                  disabled={syncing}
                                  title="Fetch closed trades and upsert into Auric"
                                >
                                  {syncing ? 'Syncing…' : 'Sync'}
                                </button>
                                <button
                                  className="px-3 py-1.5 rounded-xl border border-red-300/30 bg-red-500/10 text-sm hover:bg-red-500/20"
                                  onClick={() => {
                                    if (confirm(`Unlink "${la.label}"? This will stop syncing but keep existing trades.`)) {
                                      unlinkLinked(la.id);
                                    }
                                  }}
                                  disabled={syncing}
                                  title="Unlink this account (soft delete)"
                                >
                                  Unlink
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">No linked accounts yet. Link one to enable multi-source observability.</div>
              )}

              {/* cTrader linking */}
              <div className="mt-4 p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="text-sm font-semibold">Link a cTrader account</div>
                <div className="text-xs opacity-70 mt-1">
                  If cTrader isn’t connected yet, connect first — then pick an account and sync closed trades.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <span className={ctraderStatus?.connected ? 'text-emerald-200' : 'text-white/70'}>
                      {ctraderStatus?.connected ? 'Connected' : 'Not connected'}
                    </span>
                    {ctraderStatus?.connected ? (
                      <>
                        <span className="opacity-50">•</span>
                        <span className="opacity-80">expires {timeAgo(ctraderStatus?.expiresAt ?? null)}</span>
                      </>
                    ) : null}
                  </span>
                  {ctraderStatus?.connected ? (
                    <button
                      className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-xs hover:bg-white/10"
                      onClick={() => disconnectCTrader()}
                      title="Remove cTrader connection tokens"
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>


                {ctraderErr ? <div className="mt-2 text-sm text-red-200/80">{ctraderErr}</div> : null}

                <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <button
                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10"
                    onClick={() => {
                      const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                      const url = base ? base.replace(/\/$/, '') + '/ctrader/connect' : '/ctrader/connect';
                      window.location.href = url;
                    }}
                    title="Start cTrader OAuth"
                  >
                    Connect cTrader
                  </button>

                  <div className="flex-1 flex items-center gap-2">
                    <select
                      className="w-full sm:w-auto flex-1 px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-sm"
                      value={selectedCTraderAccountId}
                      onChange={(e) => setSelectedCTraderAccountId(e.target.value)}
                      disabled={!ctraderAccounts || !ctraderAccounts.length}
                      title="Select a cTrader trading account"
                    >
                      {(ctraderAccounts && ctraderAccounts.length ? ctraderAccounts : []).map((a) => (
                        <option key={a.accountId} value={String(a.accountId)}>
                          {a.brokerName}
                          {a.isLive ? ' LIVE' : ' DEMO'} • {a.accountId} • {a.currency}
                        </option>
                      ))}
                      {!ctraderAccounts || !ctraderAccounts.length ? <option value="">Load cTrader accounts…</option> : null}
                    </select>

                    <button
                      className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10 disabled:opacity-50"
                      onClick={() => linkAndSyncSelectedCTrader()}
                      disabled={!selectedCTraderAccountId || linking}
                      title="Create linked account record and ingest trades"
                    >
                      {linking ? 'Linking…' : 'Link + Sync'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-white/60">
                Linked accounts create stable <span className="font-mono">sourceKey</span> identifiers (e.g. <span className="font-mono">ctrader:12345</span>) so ATX can compute both overall and per-source series.
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="font-semibold">AURIX readiness</div>
              <div className="text-xs opacity-60">Institutional checks run only once observation maturity is Established and baseline is locked.</div>

              {(() => {
                const band = String(trend?.maturity?.band ?? data?.maturity?.band ?? 'initial');
                const baselineOk = Boolean((trend?.baselineLocked ?? data?.baselineLocked) === true);
                const ok = band === 'established' && baselineOk;

                const reason =
                  ok
                    ? 'Maturity established and baseline locked.'
                    : band !== 'established'
                      ? 'Awaiting Established maturity.'
                      : 'Awaiting baseline lock.';

                return (
                  <div className="mt-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                      <span className={ok ? 'text-emerald-200' : 'text-white/70'}>{ok ? 'Eligible' : 'Not yet'}</span>
                      <span className="opacity-50">•</span>
                      <span className="opacity-80">{reason}</span>
                    </div>
                    <div className="mt-3 text-xs opacity-70">
                      This gate prevents over-interpreting sparse data and avoids premature cohort / eligibility decisions.
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Per-source panel + heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm lg:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="font-semibold">Sources</div>
                  <div className="text-xs opacity-60">Per-source ATX series (daily) — helps isolate where behaviour is changing.</div>
                </div>
                {bestWorstSource ? (
                  <div className="text-xs opacity-80">
                    Best (7d avg): <span className="font-semibold">{bestWorstSource.best.source}</span> • Worst: <span className="font-semibold">{bestWorstSource.worst.source}</span>
                  </div>
                ) : null}
              </div>

              {sourcePanel.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left opacity-70">
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Latest</th>
                        <th className="py-2 pr-3">7d avg</th>
                        <th className="py-2 pr-3">Trades (7d)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourcePanel.map((r) => (
                        <tr key={r.source} className="border-t border-white/10">
                          <td className="py-2 pr-3 font-mono text-xs">{r.source}</td>
                          <td className="py-2 pr-3">{r.latestScore ?? '—'}</td>
                          <td className="py-2 pr-3">{r.avg7d ?? '—'}</td>
                          <td className="py-2 pr-3">{r.trades7d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">No per-source series yet (seed trades + refresh).</div>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="font-semibold">Recent activity</div>
              <div className="text-xs opacity-60">Last 28 days — click a day to open Journal.</div>

              <div className="mt-3 grid grid-cols-14 gap-1">
                {(() => {
                  const max = Math.max(1, ...calendar28.map((d) => d.tradeCount));
                  return calendar28.map((d) => {
                    const t = d.tradeCount;
                    const intensity = t === 0 ? 0.06 : clamp(t / max, 0.12, 1);
                    const title = `${d.date}\nTrades: ${t}` +
                      (d.hasEntry ? `\nNotes: ${d.types?.length ? d.types.join(', ') : 'yes'}` : '') +
                      (d.sources?.length ? `\nSources: ${d.sources.join(', ')}` : '');
                    return (
                      <button
                        key={d.date}
                        className="relative w-full aspect-square rounded-[6px] border border-white/10"
                        style={{ background: `rgba(255,255,255,${intensity})` }}
                        title={title}
                        onClick={() => {
                          const m = yyyymmFromIsoDay(d.date);
                          router.push(`/journal?date=${d.date}&month=${m}`);
                        }}
                      >
                        {d.hasEntry ? (
                          <span className="pointer-events-none absolute inset-[2px] rounded-[4px] ring-1 ring-white/45" />
                        ) : null}
                      </button>
                    );
                  });
                })()}
              </div>

              <div className="mt-3 text-xs text-white/60">
                Brighter cells indicate more trades recorded on that day. A subtle ring indicates a Journal note exists.
              </div>
            </div>
          </div>

          {/* Commentary */}
          {data?.commentary ? (
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="font-semibold">Commentary</div>
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
          ) : null}
        </div>
      </div>
    </Protected>
  );
}

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

type CommentaryPayload = {
  summary: string;
  bullets?: string[];
  bulletPoints?: string[];
  reflectionQuestions?: string[];
};

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
  commentary?: CommentaryPayload;
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

  // Step 2 UI state
  const [createName, setCreateName] = useState('Primary');
  const [renameName, setRenameName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const errText = useMemo(() => (err ? toDisplayString(err) : null), [err]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.accountId === accountId) || null,
    [accounts, accountId]
  );

  async function fetchAccountsAndSelect(preferAccountId?: number) {
    const list = await apiFetch<AccountsResponse>('/accounts', { auth: true });
    const accs = list.accounts || [];
    setAccounts(accs);

    const stored = getStoredAccountId();
    const candidate =
      (preferAccountId && accs.find((a) => a.accountId === preferAccountId)?.accountId) ||
      (stored && accs.find((a) => a.accountId === stored)?.accountId) ||
      accs[0]?.accountId ||
      0;

    setAccountId(candidate);
    if (candidate) setStoredAccountId(candidate);

    // Keep rename field aligned with selected account
    const newlySelected = accs.find((a) => a.accountId === candidate);
    setRenameName(newlySelected?.name ?? '');
  }

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
    const selected =
      (stored && accs.find((a) => a.accountId === stored)?.accountId) || accs[0]?.accountId || 0;

    setAccountId(selected);
    if (selected) setStoredAccountId(selected);

    const initial = accs.find((a) => a.accountId === selected);
    setRenameName(initial?.name ?? '');
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
    } catch (e: any) {
      setErr(e?.message ?? e ?? 'Failed to seed mock trades');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: create / rename / delete
  async function createAccount() {
    setLoading(true);
    setErr(null);
    setSeedInfo(null);
    setConfirmDelete(false);

    try {
      const name = createName.trim() || 'Primary';
      const created = await apiFetch<CreateAccountResponse>('/accounts', {
        method: 'POST',
        auth: true,
        body: { name }
      });

      setCreateName('Primary');
      await fetchAccountsAndSelect(created.account.accountId);
    } catch (e: any) {
      setErr(e?.message ?? e ?? 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  async function renameAccount() {
    if (!accountId) return;

    setLoading(true);
    setErr(null);
    setSeedInfo(null);

    try {
      const name = renameName.trim();
      if (!name) throw new Error('Name cannot be empty');

      await apiFetch<{ ok: boolean }>(`/accounts/${accountId}`, {
        method: 'PATCH',
        auth: true,
        body: { name }
      });

      await fetchAccountsAndSelect(accountId);
    } catch (e: any) {
      setErr(e?.message ?? e ?? 'Failed to rename account');
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (!accountId) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setLoading(true);
    setErr(null);
    setSeedInfo(null);

    try {
      await apiFetch<{ ok: boolean }>(`/accounts/${accountId}`, {
        method: 'DELETE',
        auth: true
      });

      setConfirmDelete(false);
      await fetchAccountsAndSelect(undefined);
    } catch (e: any) {
      setErr(e?.message ?? e ?? 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountId) loadATX();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, source, timeframe]);

  const commentaryBullets =
    data?.commentary?.bulletPoints?.length
      ? data.commentary.bulletPoints
      : data?.commentary?.bullets?.length
        ? data.commentary.bullets
        : [];

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

          {/* Account + ATX Controls */}
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
                  setConfirmDelete(false);

                  const selected = accounts.find((a) => a.accountId === id);
                  setRenameName(selected?.name ?? '');
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
              {selectedAccount && (
                <div className="mt-2 text-xs opacity-60">
                  Selected: <span className="font-semibold">{selectedAccount.name}</span> (#{selectedAccount.accountId})
                </div>
              )}
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

          {/* Step 2: Account Management */}
          <div className="rounded-md border p-4 space-y-4">
            <div className="text-sm font-semibold">Account management</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-md border">
                <div className="text-xs opacity-60 mb-1">Create new account</div>
                <input
                  className="w-full border rounded-md p-2"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Name (e.g. Primary, FTMO, Swing)"
                />
                <button
                  className="mt-2 px-3 py-2 rounded-md bg-black text-white text-sm"
                  onClick={createAccount}
                  disabled={loading}
                >
                  Create
                </button>
              </div>

              <div className="p-3 rounded-md border">
                <div className="text-xs opacity-60 mb-1">Rename selected account</div>
                <input
                  className="w-full border rounded-md p-2"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder="New name"
                  disabled={!accountId}
                />
                <button
                  className="mt-2 px-3 py-2 rounded-md border text-sm"
                  onClick={renameAccount}
                  disabled={loading || !accountId}
                >
                  Rename
                </button>
              </div>

              <div className="p-3 rounded-md border">
                <div className="text-xs opacity-60 mb-1">Delete selected account</div>
                <div className="text-xs opacity-60">
                  {confirmDelete
                    ? 'Click delete again to confirm.'
                    : 'This removes the account and associated state/trades.'}
                </div>
                <button
                  className={[
                    'mt-2 px-3 py-2 rounded-md text-sm',
                    confirmDelete ? 'bg-red-600 text-white' : 'border'
                  ].join(' ')}
                  onClick={deleteAccount}
                  disabled={loading || !accountId}
                >
                  {confirmDelete ? 'Confirm delete' : 'Delete'}
                </button>
                {confirmDelete && (
                  <button
                    className="mt-2 ml-2 px-3 py-2 rounded-md border text-sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
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
              title="Seeds mock trades via real /accounts endpoint, then refreshes ATX"
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

                  {commentaryBullets.length ? (
                    <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                      {commentaryBullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}

                  {data.commentary.reflectionQuestions?.length ? (
                    <div className="mt-4">
                      <div className="text-sm font-semibold">Reflection questions</div>
                      <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                        {data.commentary.reflectionQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
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

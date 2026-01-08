'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

type AccountRaw = {
  accountId: number | string;
  name: string;
  createdAt: number | string;
};

type Account = {
  accountId: number;
  name: string;
  createdAt: number;
};

type AccountsResponse = { accounts: AccountRaw[] };
type CreateAccountResponse = { account: AccountRaw };

type CalendarResponse = {
  accountId: number;
  month: string;
  days: Array<{ date: string; hasEntry: boolean; types: string[] }>;
};

type JournalEntryDTO = {
  id: string;
  type: string;
  createdAt: number;
  title: string;
  timeframe?: string;
  systemNotes: string[];
  aiReflectionQuestions: string[];
  userNotes?: string;
};

type DayResponse = {
  accountId: number;
  date: string;
  entryCount: number;
  entries: JournalEntryDTO[];
};

type TradeDTO = {
  source: string;
  tradeId: string;
  accountId: number;
  instrument?: string;
  side?: 'long' | 'short';
  qty?: number;
  timestamp: number;
  entryPrice?: number;
  exitPrice?: number;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  orderType?: 'market' | 'limit';
};

type TradesDayResponse = {
  accountId: number;
  date: string;
  sources: string[] | null;
  tradeCount: number;
  trades: TradeDTO[];
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
  flags: string[];
  profiles?: string[];
};

/**
 * Backend day endpoint returns:
 * { accountId, date, sources, tradeCount, atx }
 * (it does NOT need "source=mock/live" anymore if using unified trades table)
 */
type ATXDayResponse = {
  accountId: number;
  date: string;
  sources: string[] | null;
  tradeCount: number;
  atx: ATXSnapshot;
};

const SELECTED_ACCOUNT_KEY = 'auric_selected_account_id';

function yyyymm(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAccount(a: AccountRaw): Account {
  return {
    accountId: toNum(a.accountId),
    name: String(a.name ?? 'Primary'),
    createdAt: toNum(a.createdAt)
  };
}

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

function createdAtForDate(dateYYYYMMDD: string): number {
  const ms = Date.parse(`${dateYYYYMMDD}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : Date.now();
}

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function isValidMonth(m: string) {
  return /^\d{4}-\d{2}$/.test(m);
}

export default function JournalPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [month, setMonth] = useState<string>(yyyymm(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [day, setDay] = useState<DayResponse | null>(null);
  const [tradesDay, setTradesDay] = useState<TradesDayResponse | null>(null);
  const [atxDay, setAtxDay] = useState<ATXDayResponse | null>(null);

  const [selectedSources, setSelectedSources] = useState<string[]>([]); // empty => all

  const [error, setError] = useState<string | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  // Notes form
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Edit notes inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  /**
   * ✅ REQUEST GUARDS
   * Prevent stale responses from older requests overwriting state.
   */
  const calendarReqIdRef = useRef(0);
  const dayReqIdRef = useRef(0);

  async function ensureAccounts() {
    const list = await apiFetch<AccountsResponse>('/accounts', { auth: true });
    let accs = (list.accounts || []).map(normalizeAccount).filter((a) => a.accountId > 0);

    if (!accs.length) {
      const created = await apiFetch<CreateAccountResponse>('/accounts', {
        method: 'POST',
        auth: true,
        body: { name: 'Primary' }
      });
      accs = [normalizeAccount(created.account)];
    }

    setAccounts(accs);

    const stored = getStoredAccountId();
    const picked =
      (stored && accs.find((a) => a.accountId === stored)?.accountId) || accs[0].accountId;

    setAccountId(picked);
    setStoredAccountId(picked);
  }

  async function fetchCalendar(aid: number, m: string) {
    return await apiFetch<CalendarResponse>(`/journal/accounts/${aid}/calendar?month=${m}`, {
      auth: true
    });
  }

  async function fetchDay(aid: number, date: string) {
    return await apiFetch<DayResponse>(`/journal/accounts/${aid}/day?date=${date}`, {
      auth: true
    });
  }

  async function fetchTradesForDay(aid: number, date: string, sources?: string[]) {
    const qs = new URLSearchParams();
    qs.set('date', date);
    if (sources && sources.length) qs.set('sources', sources.join(','));

    return await apiFetch<TradesDayResponse>(`/trades/accounts/${aid}/day?${qs.toString()}`, {
      auth: true
    });
  }

  async function fetchATXForDay(aid: number, date: string, sources?: string[]) {
    const qs = new URLSearchParams();
    qs.set('date', date);
    if (sources && sources.length) qs.set('sources', sources.join(','));

    return await apiFetch<ATXDayResponse>(`/atx/accounts/${aid}/day?${qs.toString()}`, {
      auth: true
    });
  }

  useEffect(() => {
    ensureAccounts().catch((e: any) => setError(e?.message ?? 'Failed to load accounts'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ✅ Calendar load (guarded)
   * Also: only fetch if month is valid "YYYY-MM" (prevents 400 spam).
   */
  useEffect(() => {
    if (!accountId) return;

    setError(null);
    setSelectedDate(null);

    setDay(null);
    setTradesDay(null);
    setAtxDay(null);

    setSelectedSources([]);
    setEditingId(null);
    setEditNotes('');
    setNewTitle('');
    setNewNotes('');

    // Don’t fetch if invalid month (type="month" prevents it, but extra safety)
    if (!isValidMonth(month)) {
      setCalendar(null);
      return;
    }

    const reqId = ++calendarReqIdRef.current;
    setLoadingCalendar(true);

    fetchCalendar(accountId, month)
      .then((res) => {
        if (calendarReqIdRef.current !== reqId) return; // stale
        setCalendar(res);
      })
      .catch((e: any) => {
        if (calendarReqIdRef.current !== reqId) return; // stale
        setError(e?.message ?? 'Failed to load calendar');
        setCalendar(null);
      })
      .finally(() => {
        if (calendarReqIdRef.current !== reqId) return; // stale
        setLoadingCalendar(false);
      });
  }, [accountId, month]);

  /**
   * ✅ Day load (guarded)
   * Loads: journal day, trades day, ATX day — as a single guarded batch.
   * This fixes: “trades show but ATX says NO_TRADES_FOR_DAY”
   */
  useEffect(() => {
    if (!accountId || !selectedDate) return;

    setError(null);
    setLoadingDay(true);

    setDay(null);
    setTradesDay(null);
    setAtxDay(null);

    setSelectedSources([]); // reset to “all”
    setEditingId(null);
    setEditNotes('');

    const reqId = ++dayReqIdRef.current;
    const srcs = undefined; // all sources on initial day load

    Promise.all([
      fetchDay(accountId, selectedDate),
      fetchTradesForDay(accountId, selectedDate, srcs),
      fetchATXForDay(accountId, selectedDate, srcs)
    ])
      .then(([dayRes, tradesRes, atxRes]) => {
        if (dayReqIdRef.current !== reqId) return; // stale
        setDay(dayRes);
        setTradesDay(tradesRes);
        setAtxDay(atxRes);
      })
      .catch((e: any) => {
        if (dayReqIdRef.current !== reqId) return; // stale
        setError(e?.message ?? 'Failed to load day');
      })
      .finally(() => {
        if (dayReqIdRef.current !== reqId) return; // stale
        setLoadingDay(false);
      });
  }, [accountId, selectedDate]);

  const markers = useMemo(() => {
    const map = new Map<string, string[]>();
    (calendar?.days ?? []).forEach((d) => map.set(d.date, d.types));
    return map;
  }, [calendar]);

  const [yy, mm] = month.split('-').map(Number);
  const monthIndex = (mm ?? 1) - 1;
  const totalDays = Number.isFinite(yy) && Number.isFinite(monthIndex) ? daysInMonth(yy, monthIndex) : 30;

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    (tradesDay?.trades ?? []).forEach((t) => set.add(t.source));
    return Array.from(set).sort();
  }, [tradesDay]);

  async function refreshDayViews(nextSources: string[]) {
    if (!accountId || !selectedDate) return;

    const reqId = ++dayReqIdRef.current; // new “latest”
    setLoadingDay(true);
    setError(null);

    try {
      const srcs = nextSources.length ? nextSources : undefined;

      const [tradesRes, atxRes, dayRes] = await Promise.all([
        fetchTradesForDay(accountId, selectedDate, srcs),
        fetchATXForDay(accountId, selectedDate, srcs),
        fetchDay(accountId, selectedDate)
      ]);

      if (dayReqIdRef.current !== reqId) return; // stale

      setTradesDay(tradesRes);
      setAtxDay(atxRes);
      setDay(dayRes);
    } catch (e: any) {
      if (dayReqIdRef.current !== reqId) return; // stale
      setError(e?.message ?? 'Failed to refresh day');
    } finally {
      if (dayReqIdRef.current !== reqId) return; // stale
      setLoadingDay(false);
    }
  }

  async function toggleSource(source: string) {
    if (!accountId || !selectedDate) return;

    const next = selectedSources.includes(source)
      ? selectedSources.filter((s) => s !== source)
      : [...selectedSources, source];

    setSelectedSources(next);
    await refreshDayViews(next);
  }

  async function clearSourceFilters() {
    setSelectedSources([]);
    await refreshDayViews([]);
  }

  async function createEntry() {
    if (!accountId || !selectedDate) return;

    const title = newTitle.trim() || 'Notes';
    const notes = newNotes.trim();

    setError(null);
    setLoadingDay(true);

    try {
      await apiFetch(`/journal/accounts/${accountId}/entries`, {
        method: 'POST',
        auth: true,
        body: {
          title,
          userNotes: notes || undefined,
          createdAt: createdAtForDate(selectedDate)
        }
      });

      setNewTitle('');
      setNewNotes('');

      // refresh day + calendar (calendar guarded)
      const reqId = ++dayReqIdRef.current;
      const [dayRes] = await Promise.all([fetchDay(accountId, selectedDate)]);
      if (dayReqIdRef.current === reqId) setDay(dayRes);

      // trigger calendar reload safely
      const calReqId = ++calendarReqIdRef.current;
      setLoadingCalendar(true);
      fetchCalendar(accountId, month)
        .then((cal) => {
          if (calendarReqIdRef.current !== calReqId) return;
          setCalendar(cal);
        })
        .finally(() => {
          if (calendarReqIdRef.current !== calReqId) return;
          setLoadingCalendar(false);
        });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create notes');
    } finally {
      setLoadingDay(false);
    }
  }

  function startEdit(entry: JournalEntryDTO) {
    setEditingId(entry.id);
    setEditNotes(entry.userNotes ?? '');
  }

  async function saveEdit(entryId: string) {
    if (!accountId || !selectedDate) return;

    const notes = editNotes.trim();
    if (!notes) {
      setError('Notes cannot be empty');
      return;
    }

    setError(null);
    setLoadingDay(true);

    try {
      await apiFetch(`/journal/accounts/${accountId}/entries/${entryId}`, {
        method: 'PATCH',
        auth: true,
        body: { userNotes: notes }
      });

      setEditingId(null);
      setEditNotes('');

      await Promise.all([refreshDayViews(selectedSources)]);
      // calendar markers (still based on journal entries)
      const calReqId = ++calendarReqIdRef.current;
      setLoadingCalendar(true);
      fetchCalendar(accountId, month)
        .then((cal) => {
          if (calendarReqIdRef.current !== calReqId) return;
          setCalendar(cal);
        })
        .finally(() => {
          if (calendarReqIdRef.current !== calReqId) return;
          setLoadingCalendar(false);
        });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update notes');
    } finally {
      setLoadingDay(false);
    }
  }

  return (
    <Protected>
      <main className="min-h-screen p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Journal</h1>
            <p className="text-sm opacity-70">Trades are automatic (by source). Notes/reflections sit on top.</p>
          </div>
          <button className="rounded-xl border px-4 py-2" onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Left */}
          <div className="rounded-2xl border p-4 space-y-4">
            <div>
              <label className="text-sm opacity-70">Account</label>
              <select
                className="mt-1 w-full rounded-xl border p-3"
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

            <div>
              <label className="text-sm opacity-70">Month</label>
              {/* ✅ type="month" prevents invalid partial strings and kills 400 spam */}
              <input
                type="month"
                className="mt-1 w-full rounded-xl border p-3"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
              <div className="mt-1 text-xs opacity-60">Choose a month</div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm font-semibold">Add notes (not trades)</div>
              {!selectedDate ? (
                <div className="mt-2 text-sm opacity-70">Select a day on the calendar first.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="text-xs opacity-60">Selected date: {selectedDate}</div>

                  <input
                    className="w-full rounded-xl border p-2"
                    placeholder="Title (optional — defaults to “Notes”)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={loadingCalendar || loadingDay}
                  />

                  <textarea
                    className="w-full rounded-xl border p-2 min-h-[90px]"
                    placeholder="Notes"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    disabled={loadingCalendar || loadingDay}
                  />

                  <button
                    className="px-3 py-2 rounded-xl bg-black text-white text-sm"
                    onClick={createEntry}
                    disabled={loadingCalendar || loadingDay}
                  >
                    {loadingDay ? 'Saving…' : 'Save notes'}
                  </button>
                </div>
              )}
            </div>

            {(loadingCalendar || loadingDay) && <div className="text-sm opacity-70">Loading…</div>}

            {error && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
          </div>

          {/* Right */}
          <div className="rounded-2xl border p-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: totalDays }).map((_, i) => {
                const dayNum = i + 1;
                const date = `${month}-${String(dayNum).padStart(2, '0')}`;
                const types = markers.get(date) ?? [];
                const active = selectedDate === date;

                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={[
                      'rounded-xl border p-3 text-left',
                      active ? 'border-black bg-black/5' : 'border-black/10'
                    ].join(' ')}
                  >
                    <div className="text-sm font-semibold">{dayNum}</div>
                    <div className="mt-1 text-[11px] opacity-60">{types.length ? types.join(', ') : '—'}</div>
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <div className="mt-4 rounded-2xl border p-4 space-y-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{selectedDate}</div>
                  <div className="text-sm opacity-70">
                    {day?.entryCount ?? 0} entries • {tradesDay?.tradeCount ?? 0} trades
                  </div>
                </div>

                {/* ATX micro-summary */}
                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">ATX for this day</div>
                    <div className="text-xs opacity-60">
                      {selectedSources.length ? selectedSources.join(', ') : 'all sources'}
                    </div>
                  </div>

                  {atxDay ? (
                    <div className="mt-2">
                      <div className="flex items-baseline justify-between">
                        <div className="text-xl font-semibold">{atxDay.atx.score}</div>
                        <div className="text-xs opacity-60">{atxDay.tradeCount} trades</div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs opacity-80">
                        <div>D: {atxDay.atx.subscores.discipline}</div>
                        <div>R: {atxDay.atx.subscores.riskIntegrity}</div>
                        <div>E: {atxDay.atx.subscores.executionStability}</div>
                        <div>V: {atxDay.atx.subscores.behaviouralVolatility}</div>
                        <div>C: {atxDay.atx.subscores.consistency}</div>
                      </div>

                      {atxDay.atx.flags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {atxDay.atx.flags.map((f) => (
                            <span key={f} className="px-2 py-1 rounded-md border text-[11px]">
                              {f}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs opacity-60">No flags.</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm opacity-70">ATX day summary not loaded.</div>
                  )}
                </div>

                {/* Trades */}
                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Trades</div>
                    <div className="text-xs opacity-60">{tradesDay ? `${tradesDay.tradeCount} total` : '—'}</div>
                  </div>

                  {availableSources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableSources.map((s) => {
                        const active = selectedSources.length === 0 || selectedSources.includes(s);
                        return (
                          <button
                            key={s}
                            className={[
                              'px-3 py-1.5 rounded-xl border text-xs',
                              active ? 'bg-black text-white border-black' : 'border-black/20'
                            ].join(' ')}
                            onClick={() => toggleSource(s)}
                            disabled={loadingDay}
                          >
                            {s}
                          </button>
                        );
                      })}
                      {selectedSources.length > 0 && (
                        <button className="px-3 py-1.5 rounded-xl border text-xs" onClick={clearSourceFilters} disabled={loadingDay}>
                          Clear
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    {(tradesDay?.trades ?? []).slice(0, 50).map((t) => (
                      <div key={`${t.source}:${t.tradeId}`} className="rounded-xl border p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="font-semibold text-sm">
                            {t.instrument || '—'} • {t.side || '—'} • {t.qty ?? '—'}
                          </div>
                          <div className="text-xs opacity-60">{t.source}</div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs opacity-80">
                          <div>Time: {fmtTime(t.timestamp)}</div>
                          <div>Order: {t.orderType || '—'}</div>
                          <div>Entry: {t.entryPrice ?? '—'}</div>
                          <div>Exit: {t.exitPrice ?? '—'}</div>
                          <div>SL: {t.stopLossPrice ?? '—'}</div>
                          <div>TP: {t.takeProfitPrice ?? '—'}</div>
                        </div>
                      </div>
                    ))}

                    {tradesDay && tradesDay.trades.length > 50 && <div className="text-xs opacity-60">Showing first 50 trades.</div>}
                    {tradesDay && tradesDay.trades.length === 0 && <div className="text-sm opacity-70">No trades for this day.</div>}
                    {!tradesDay && <div className="text-sm opacity-70">Trades not loaded yet.</div>}
                  </div>
                </div>

                {/* Notes */}
                <div className="rounded-xl border p-3">
                  <div className="mb-2 flex items-baseline justify-between">
                    <div className="text-sm font-semibold">Notes & entries</div>
                    <div className="text-xs opacity-60">{day?.entryCount ?? 0} total</div>
                  </div>

                  <div className="space-y-3">
                    {(day?.entries ?? []).map((e) => {
                      const isEditing = editingId === e.id;

                      return (
                        <div key={e.id} className="rounded-xl border p-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="font-semibold">{e.title}</div>
                            <div className="text-xs opacity-60">{e.type}</div>
                          </div>

                          {!isEditing ? (
                            <>
                              {e.userNotes ? (
                                <div className="mt-2 text-sm whitespace-pre-wrap">{e.userNotes}</div>
                              ) : (
                                <div className="mt-2 text-sm opacity-60">No notes yet.</div>
                              )}

                              <div className="mt-3 flex gap-2">
                                <button className="px-3 py-2 rounded-xl border text-sm" onClick={() => startEdit(e)} disabled={loadingDay}>
                                  Edit notes
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <textarea
                                className="mt-2 w-full rounded-xl border p-2 min-h-[90px]"
                                value={editNotes}
                                onChange={(ev) => setEditNotes(ev.target.value)}
                                disabled={loadingDay}
                              />
                              <div className="mt-3 flex gap-2">
                                <button className="px-3 py-2 rounded-xl bg-black text-white text-sm" onClick={() => saveEdit(e.id)} disabled={loadingDay}>
                                  {loadingDay ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  className="px-3 py-2 rounded-xl border text-sm"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditNotes('');
                                  }}
                                  disabled={loadingDay}
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {day && day.entries.length === 0 && <div className="text-sm opacity-70">No notes for this day yet.</div>}
                    {!day && <div className="text-sm opacity-70">Day not loaded yet.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </Protected>
  );
}

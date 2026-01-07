'use client';

import { useEffect, useMemo, useState } from 'react';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

type Account = {
  accountId: number;
  name: string;
  createdAt: number;
};

type AccountsResponse = { accounts: Account[] };
type CreateAccountResponse = { account: Account };

type CalendarDayDTO = {
  date: string;
  hasEntry: boolean;
  types: string[];
  hasTrades?: boolean;
  tradeCount?: number;
  sources?: string[];
};

type CalendarResponse = {
  accountId: number;
  month: string;
  days: CalendarDayDTO[];
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
  source: string; // added by backend unified trades day endpoint
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

const SELECTED_ACCOUNT_KEY = 'auric_selected_account_id';

function yyyymm(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
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
  // Pin to noon UTC so it reliably falls on the selected date
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

export default function JournalPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [month, setMonth] = useState<string>(yyyymm(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [day, setDay] = useState<DayResponse | null>(null);
  const [tradesDay, setTradesDay] = useState<TradesDayResponse | null>(null);

  const [selectedSources, setSelectedSources] = useState<string[]>([]); // empty => all

  const [error, setError] = useState<string | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  // Notes form (NOT trades)
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Edit notes inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

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

  async function loadCalendar(aid: number, m: string) {
    const res = await apiFetch<CalendarResponse>(`/journal/accounts/${aid}/calendar?month=${m}`, {
      auth: true
    });
    setCalendar(res);
  }

  async function loadDay(aid: number, date: string) {
    const res = await apiFetch<DayResponse>(`/journal/accounts/${aid}/day?date=${date}`, {
      auth: true
    });
    setDay(res);
  }

  async function loadTradesForDay(aid: number, date: string, sources?: string[]) {
    const qs = new URLSearchParams();
    qs.set('date', date);
    if (sources && sources.length) qs.set('sources', sources.join(','));

    const res = await apiFetch<TradesDayResponse>(`/trades/accounts/${aid}/day?${qs.toString()}`, {
      auth: true
    });
    setTradesDay(res);
  }

  useEffect(() => {
    ensureAccounts().catch((e: any) => setError(e?.message ?? 'Failed to load accounts'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load calendar when account/month changes
  useEffect(() => {
    if (!accountId) return;

    setError(null);
    setSelectedDate(null);

    setDay(null);
    setTradesDay(null);
    setSelectedSources([]);

    setEditingId(null);
    setEditNotes('');
    setNewTitle('');
    setNewNotes('');

    setLoadingCalendar(true);
    loadCalendar(accountId, month)
      .catch((e: any) => setError(e?.message ?? 'Failed to load calendar'))
      .finally(() => setLoadingCalendar(false));
  }, [accountId, month]);

  // Load day + trades when selectedDate changes
  useEffect(() => {
    if (!accountId || !selectedDate) return;

    setError(null);
    setLoadingDay(true);

    setDay(null);
    setTradesDay(null);
    setSelectedSources([]); // default "all sources" when switching day
    setEditingId(null);
    setEditNotes('');

    Promise.all([loadDay(accountId, selectedDate), loadTradesForDay(accountId, selectedDate)])
      .catch((e: any) => setError(e?.message ?? 'Failed to load day'))
      .finally(() => setLoadingDay(false));
  }, [accountId, selectedDate]);

  // Map date -> full day object (now includes trades fields)
  const calendarByDate = useMemo(() => {
    const map = new Map<string, CalendarDayDTO>();
    (calendar?.days ?? []).forEach((d) => map.set(d.date, d));
    return map;
  }, [calendar]);

  // Keep older markers (types) for any other logic
  const markers = useMemo(() => {
    const map = new Map<string, string[]>();
    (calendar?.days ?? []).forEach((d) => map.set(d.date, d.types));
    return map;
  }, [calendar]);

  const [yy, mm] = month.split('-').map(Number);
  const monthIndex = (mm ?? 1) - 1;
  const totalDays = daysInMonth(yy, monthIndex);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    (tradesDay?.trades ?? []).forEach((t) => set.add(t.source));
    return Array.from(set).sort();
  }, [tradesDay]);

  async function toggleSource(source: string) {
    if (!accountId || !selectedDate) return;

    let next: string[];
    if (selectedSources.includes(source)) {
      next = selectedSources.filter((s) => s !== source);
    } else {
      next = [...selectedSources, source];
    }

    setSelectedSources(next);

    setLoadingDay(true);
    setError(null);
    try {
      await loadTradesForDay(accountId, selectedDate, next.length ? next : undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load trades');
    } finally {
      setLoadingDay(false);
    }
  }

  async function createEntry() {
    if (!accountId || !selectedDate) return;

    // Notes-only entry (title optional in UI, but backend expects it)
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

      await Promise.all([loadDay(accountId, selectedDate), loadCalendar(accountId, month)]);
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

      await Promise.all([loadDay(accountId, selectedDate), loadCalendar(accountId, month)]);
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
            <p className="text-sm opacity-70">
              Trades are automatic (by source). Journal entries are your notes/reflections layered on top.
            </p>
          </div>
          <button className="rounded-xl border px-4 py-2" onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Left: controls + notes */}
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
              <input
                className="mt-1 w-full rounded-xl border p-3"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="YYYY-MM"
              />
              <div className="mt-1 text-xs opacity-60">Format: YYYY-MM</div>
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

          {/* Right: calendar + day */}
          <div className="rounded-2xl border p-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: totalDays }).map((_, i) => {
                const dayNum = i + 1;
                const date = `${month}-${String(dayNum).padStart(2, '0')}`;

                const calDay = calendarByDate.get(date);
                const types = markers.get(date) ?? [];

                const hasEntry = !!calDay?.hasEntry || types.length > 0;
                const tradeCount = calDay?.tradeCount ?? 0;
                const hasTrades = !!calDay?.hasTrades || tradeCount > 0;

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

                    <div className="mt-1 text-[11px] opacity-60">
                      {hasEntry ? (types.length ? types.join(', ') : 'entry') : '—'}
                    </div>

                    {hasTrades ? (
                      <div className="mt-2 flex flex-col gap-1">
                        <div className="inline-flex items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md border">{tradeCount} trades</span>
                        </div>
                        {(calDay?.sources?.length ?? 0) > 0 ? (
                          <div className="text-[10px] opacity-60 truncate">
                            {(calDay?.sources ?? []).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Day panel */}
            {selectedDate && (
              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <div className="font-semibold">{selectedDate}</div>
                  <div className="text-sm opacity-70">
                    {day?.entryCount ?? 0} entries • {tradesDay?.tradeCount ?? 0} trades
                  </div>
                </div>

                {/* Trades */}
                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Trades</div>
                    <div className="text-xs opacity-60">{tradesDay ? `${tradesDay.tradeCount} total` : '—'}</div>
                  </div>

                  {/* Source filters */}
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
                            title="Toggle source filter"
                          >
                            {s}
                          </button>
                        );
                      })}
                      {selectedSources.length > 0 && (
                        <button
                          className="px-3 py-1.5 rounded-xl border text-xs"
                          onClick={async () => {
                            if (!accountId || !selectedDate) return;
                            setSelectedSources([]);
                            setLoadingDay(true);
                            try {
                              await loadTradesForDay(accountId, selectedDate);
                            } finally {
                              setLoadingDay(false);
                            }
                          }}
                          disabled={loadingDay}
                          title="Clear filters"
                        >
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

                    {tradesDay && tradesDay.trades.length > 50 && (
                      <div className="text-xs opacity-60">Showing first 50 trades for readability.</div>
                    )}

                    {tradesDay && tradesDay.trades.length === 0 && (
                      <div className="text-sm opacity-70">No trades for this day.</div>
                    )}

                    {!tradesDay && <div className="text-sm opacity-70">Trades not loaded yet.</div>}
                  </div>
                </div>

                {/* Entries */}
                <div className="mt-4 rounded-xl border p-3">
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
                                <button
                                  className="px-3 py-2 rounded-xl border text-sm"
                                  onClick={() => startEdit(e)}
                                  disabled={loadingDay}
                                >
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
                                <button
                                  className="px-3 py-2 rounded-xl bg-black text-white text-sm"
                                  onClick={() => saveEdit(e.id)}
                                  disabled={loadingDay}
                                >
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

                          {e.systemNotes?.length ? (
                            <ul className="mt-3 list-disc pl-5 text-sm opacity-70 space-y-1">
                              {e.systemNotes.map((n, idx) => (
                                <li key={idx}>{n}</li>
                              ))}
                            </ul>
                          ) : null}

                          {e.aiReflectionQuestions?.length ? (
                            <div className="mt-3">
                              <div className="text-sm font-semibold">Reflection</div>
                              <ul className="mt-2 list-disc pl-5 text-sm opacity-70 space-y-1">
                                {e.aiReflectionQuestions.map((q, idx) => (
                                  <li key={idx}>{q}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {day && day.entries.length === 0 && (
                      <div className="text-sm opacity-70">No notes for this day yet.</div>
                    )}

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

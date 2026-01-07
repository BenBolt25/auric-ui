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

export default function JournalPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [month, setMonth] = useState<string>(yyyymm(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<DayResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Create entry form
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

  useEffect(() => {
    ensureAccounts().catch((e: any) => setError(e?.message ?? 'Failed to load accounts'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;

    setError(null);
    setSelectedDate(null);
    setDay(null);
    setEditingId(null);
    setEditNotes('');
    setNewTitle('');
    setNewNotes('');

    setLoading(true);
    loadCalendar(accountId, month)
      .catch((e: any) => setError(e?.message ?? 'Failed to load calendar'))
      .finally(() => setLoading(false));
  }, [accountId, month]);

  useEffect(() => {
    if (!accountId || !selectedDate) return;

    setError(null);
    setLoading(true);
    loadDay(accountId, selectedDate)
      .catch((e: any) => setError(e?.message ?? 'Failed to load day'))
      .finally(() => setLoading(false));
  }, [accountId, selectedDate]);

  const markers = useMemo(() => {
    const map = new Map<string, string[]>();
    (calendar?.days ?? []).forEach((d) => map.set(d.date, d.types));
    return map;
  }, [calendar]);

  const [yy, mm] = month.split('-').map(Number);
  const monthIndex = (mm ?? 1) - 1;
  const totalDays = daysInMonth(yy, monthIndex);

  async function createEntry() {
    if (!accountId || !selectedDate) return;

    const title = newTitle.trim();
    if (!title) {
      setError('Title is required');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await apiFetch(`/journal/accounts/${accountId}/entries`, {
        method: 'POST',
        auth: true,
        body: {
          title,
          userNotes: newNotes.trim() || undefined,
          createdAt: createdAtForDate(selectedDate)
        }
      });

      setNewTitle('');
      setNewNotes('');

      // Refresh both day + calendar markers
      await loadDay(accountId, selectedDate);
      await loadCalendar(accountId, month);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create entry');
    } finally {
      setLoading(false);
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
    setLoading(true);

    try {
      await apiFetch(`/journal/accounts/${accountId}/entries/${entryId}`, {
        method: 'PATCH',
        auth: true,
        body: { userNotes: notes }
      });

      setEditingId(null);
      setEditNotes('');

      await loadDay(accountId, selectedDate);
      await loadCalendar(accountId, month);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update notes');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Protected>
      <main className="min-h-screen p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Journal</h1>
            <p className="text-sm opacity-70">Calendar-based reflection with manual entries.</p>
          </div>
          <button className="rounded-xl border px-4 py-2" onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Left: controls + create entry */}
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
              <div className="text-sm font-semibold">Create entry</div>
              {!selectedDate ? (
                <div className="mt-2 text-sm opacity-70">Select a day on the calendar first.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="text-xs opacity-60">Selected date: {selectedDate}</div>
                  <input
                    className="w-full rounded-xl border p-2"
                    placeholder="Title (required)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={loading}
                  />
                  <textarea
                    className="w-full rounded-xl border p-2 min-h-[90px]"
                    placeholder="Notes (optional)"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    className="px-3 py-2 rounded-xl bg-black text-white text-sm"
                    onClick={createEntry}
                    disabled={loading}
                  >
                    {loading ? 'Saving…' : 'Create'}
                  </button>
                </div>
              )}
            </div>

            {loading && <div className="text-sm opacity-70">Loading…</div>}

            {error && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
          </div>

          {/* Right: calendar + day entries */}
          <div className="rounded-2xl border p-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: totalDays }).map((_, i) => {
                const dayNum = i + 1;
                const date = `${month}-${String(dayNum).padStart(2, '0')}`;
                const types = markers.get(date) ?? [];
                const has = types.length > 0;
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
                    <div className="mt-1 text-[11px] opacity-60">{has ? types.join(', ') : '—'}</div>
                  </button>
                );
              })}
            </div>

            {day && (
              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="font-semibold">{day.date}</div>
                  <div className="text-sm opacity-70">{day.entryCount} entries</div>
                </div>

                <div className="space-y-3">
                  {day.entries.map((e) => {
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
                                disabled={loading}
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
                              disabled={loading}
                            />
                            <div className="mt-3 flex gap-2">
                              <button
                                className="px-3 py-2 rounded-xl bg-black text-white text-sm"
                                onClick={() => saveEdit(e.id)}
                                disabled={loading}
                              >
                                {loading ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                className="px-3 py-2 rounded-xl border text-sm"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditNotes('');
                                }}
                                disabled={loading}
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

                  {day.entries.length === 0 && (
                    <div className="text-sm opacity-70">No entries for this day.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </Protected>
  );
}

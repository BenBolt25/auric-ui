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

type DayResponse = {
  accountId: number;
  date: string;
  entryCount: number;
  entries: Array<{
    id: string;
    type: string;
    createdAt: number;
    title: string;
    timeframe?: string;
    systemNotes: string[];
    aiReflectionQuestions: string[];
    userNotes?: string;
  }>;
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

export default function JournalPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number>(0);

  const [month, setMonth] = useState<string>(yyyymm(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    ensureAccounts().catch((e: any) => setError(e?.message ?? 'Failed to load accounts'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;

    setError(null);
    setSelectedDate(null);
    setDay(null);

    (async () => {
      const res = await apiFetch<CalendarResponse>(
        `/journal/accounts/${accountId}/calendar?month=${month}`,
        { auth: true }
      );
      setCalendar(res);
    })().catch((e: any) => setError(e?.message ?? 'Failed to load calendar'));
  }, [accountId, month]);

  useEffect(() => {
    if (!accountId || !selectedDate) return;
    setError(null);

    (async () => {
      const res = await apiFetch<DayResponse>(
        `/journal/accounts/${accountId}/day?date=${selectedDate}`,
        { auth: true }
      );
      setDay(res);
    })().catch((e: any) => setError(e?.message ?? 'Failed to load day'));
  }, [accountId, selectedDate]);

  const markers = useMemo(() => {
    const map = new Map<string, string[]>();
    (calendar?.days ?? []).forEach((d) => map.set(d.date, d.types));
    return map;
  }, [calendar]);

  const [yy, mm] = month.split('-').map(Number);
  const monthIndex = (mm ?? 1) - 1;
  const totalDays = daysInMonth(yy, monthIndex);

  return (
    <Protected>
      <main className="min-h-screen p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Journal</h1>
            <p className="text-sm text-white/70">Calendar-based reflection with system prompts and summaries.</p>
          </div>
          <button className="rounded-xl border border-white/15 px-4 py-2" onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-white/70">Account</label>
                <select
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3"
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
                <label className="text-sm text-white/70">Month</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 p-3"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  placeholder="YYYY-MM"
                />
                <div className="mt-1 text-xs text-white/50">Format: YYYY-MM</div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 lg:col-span-2">
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
                      active ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5'
                    ].join(' ')}
                  >
                    <div className="text-sm font-semibold">{dayNum}</div>
                    <div className="mt-1 text-[11px] text-white/60">{has ? types.join(', ') : '—'}</div>
                  </button>
                );
              })}
            </div>

            {day && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="font-semibold">{day.date}</div>
                  <div className="text-sm text-white/60">{day.entryCount} entries</div>
                </div>

                <div className="space-y-3">
                  {day.entries.map((e) => (
                    <div key={e.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-baseline justify-between">
                        <div className="font-semibold">{e.title}</div>
                        <div className="text-xs text-white/60">{e.type}</div>
                      </div>

                      {e.userNotes && <div className="mt-2 text-sm text-white/80">{e.userNotes}</div>}

                      {e.systemNotes?.length ? (
                        <ul className="mt-2 list-disc pl-5 text-sm text-white/70 space-y-1">
                          {e.systemNotes.map((n, idx) => (
                            <li key={idx}>{n}</li>
                          ))}
                        </ul>
                      ) : null}

                      {e.aiReflectionQuestions?.length ? (
                        <div className="mt-3">
                          <div className="text-sm font-semibold">Reflection</div>
                          <ul className="mt-2 list-disc pl-5 text-sm text-white/70 space-y-1">
                            {e.aiReflectionQuestions.map((q, idx) => (
                              <li key={idx}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {day.entries.length === 0 && (
                    <div className="text-sm text-white/70">No entries for this day.</div>
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import Protected from '@/components/Protected';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

type DevAccountsResponse = {
  accounts: Array<{ accountId: number; sources: Array<'mock' | 'live'> }>;
};

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

function yyyymm(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export default function JournalPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<DevAccountsResponse['accounts']>([]);
  const [accountId, setAccountId] = useState<number | null>(null);

  const [month, setMonth] = useState<string>(yyyymm(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<DevAccountsResponse>('/dev/accounts');
      setAccounts(res.accounts);
      if (res.accounts.length) setAccountId(res.accounts[0].accountId);
    })().catch((e: any) => setError(e?.message ?? 'Failed to load accounts'));
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
    (calendar?.days ?? []).forEach(d => map.set(d.date, d.types));
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
            <p className="text-sm text-white/70">
              Calendar-based reflection with system prompts and summaries.
            </p>
          </div>
          <button
            className="rounded-xl border border-white/15 px-4 py-2"
            onClick={() => router.push('/dashboard')}
          >
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
                  value={accountId ?? ''}
                  onChange={(e) => setAccountId(Number(e.target.value))}
                >
                  {accounts.map(a => (
                    <option key={a.accountId} value={a.accountId}>
                      {a.accountId}
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
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 lg:col-span-2">
            <div className="grid grid-cols-7 gap-2 text-xs text-white/60">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="p-2">{d}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
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
                      active ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5',
                    ].join(' ')}
                  >
                    <div className="text-sm font-semibold">{dayNum}</div>
                    <div className="mt-1 text-[11px] text-white/60">
                      {has ? types.join(', ') : '—'}
                    </div>
                  </button>
                );
              })}
            </div>

            {day && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium">Entries — {day.date}</div>
                <div className="mt-3 space-y-3">
                  {day.entries.map(e => (
                    <div key={e.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{e.title}</div>
                        <div className="text-xs text-white/60">{e.type}{e.timeframe ? ` • ${e.timeframe}` : ''}</div>
                      </div>

                      {e.systemNotes?.length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-sm text-white/75 space-y-1">
                          {e.systemNotes.slice(0, 6).map((n, idx) => <li key={idx}>{n}</li>)}
                        </ul>
                      )}

                      {e.aiReflectionQuestions?.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs uppercase text-white/60">Reflection</div>
                          <ul className="mt-2 list-disc pl-5 text-sm text-white/75 space-y-1">
                            {e.aiReflectionQuestions.slice(0, 3).map((q, idx) => <li key={idx}>{q}</li>)}
                          </ul>
                        </div>
                      )}

                      {e.userNotes && (
                        <div className="mt-3 text-sm text-white/80">
                          <span className="text-white/60">Your notes: </span>{e.userNotes}
                        </div>
                      )}
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

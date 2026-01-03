// auric-ui/src/app/page.tsx

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border p-8 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Auric</h1>
            <p className="mt-2 text-sm opacity-70">
              Behaviour-first trader development: ATX + epochs + journal + narrative.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/login"
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Register
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">ATX</div>
            <div className="mt-1 text-sm opacity-70">
              Behavioural reliability score with subscores, flags, and profiles.
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Journal</div>
            <div className="mt-1 text-sm opacity-70">
              Calendar-based reflection prompts + summaries (weekly/monthly).
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Epochs</div>
            <div className="mt-1 text-sm opacity-70">
              No resets. Behaviour history persists while momentum can reset.
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Narrative</div>
            <div className="mt-1 text-sm opacity-70">
              Non-directive commentary: no formulas, no thresholds, no advice.
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Go to dashboard
          </Link>
          <Link
            href="/journal"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Open journal
          </Link>
        </div>

        <p className="mt-6 text-xs opacity-60">
          Note: If you aren&apos;t logged in, protected pages will redirect you to /login.
        </p>
      </div>
    </main>
  );
}

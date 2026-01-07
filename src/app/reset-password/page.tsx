import { Suspense } from 'react';
import ResetPasswordClient from './reset-password-client';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center p-6">Loading…</main>}>
      <ResetPasswordClient />
    </Suspense>
  );
}

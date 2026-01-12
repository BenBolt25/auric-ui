'use client';
import React from 'react';

export type ATXMaturityBand = 'initial' | 'developing' | 'established';
export type ATXMaturity = { band: ATXMaturityBand; label: string; memo: string };

export function MaturityBadge({
  maturity,
  baselineLocked,
  className
}: {
  maturity: ATXMaturity | null | undefined;
  baselineLocked?: boolean | null;
  className?: string;
}) {
  if (!maturity) return null;

  const bandClass =
    maturity.band === 'established'
      ? 'border-white/25 bg-white/10 text-white'
      : maturity.band === 'developing'
      ? 'border-white/20 bg-white/7 text-white'
      : 'border-white/15 bg-white/5 text-white';

  const title = [
    maturity.memo,
    'ATX updates daily and becomes more reliable as Auric observes behaviour across time and market conditions.',
    baselineLocked === true ? 'Baseline locked — stable interpretation enabled.' : 'Baseline forming — interpret early changes cautiously.'
  ].join('\n');

  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] leading-none',
        bandClass,
        className || ''
      ].join(' ')}
    >
      <span className="opacity-70">Observation:</span>
      <span className="font-semibold">{maturity.label}</span>
    </span>
  );
}

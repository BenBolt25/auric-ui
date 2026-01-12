'use client';
import React from 'react';

export function Sparkline({
  values,
  className,
  title,
  min = 0,
  max = 100
}: {
  values: Array<number | null | undefined>;
  className?: string;
  title?: string;
  min?: number;
  max?: number;
}) {
  const w = 100, h = 24, pad = 2;
  const spanX = Math.max(1, values.length - 1);
  const clamp = (x: number) => Math.max(min, Math.min(max, x));
  const xFor = (i: number) => pad + (i / spanX) * (w - pad * 2);
  const yFor = (v: number) => {
    const t = (clamp(v) - min) / Math.max(1, max - min);
    return pad + (1 - t) * (h - pad * 2);
  };

  let d = '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const x = xFor(i), y = yFor(v);
    d = d ? `${d} L ${x.toFixed(2)} ${y.toFixed(2)}` : `M ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return (
    <svg viewBox="0 0 100 24" className={className} aria-hidden>
      {title ? <title>{title}</title> : null}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.75} />
    </svg>
  );
}

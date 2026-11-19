import React from 'react';
import type {Bar} from '../../lib/ministryAnalytics';

const nf = new Intl.NumberFormat('en-US');

/**
 * Expected-versus-actual harvest chart (metric tons). Built from exactly the rows passed in; every bar carries its number as text, the two series
 * differ by pattern AND label (not colour alone), and the table above/below shows the same data. Plain HTML/CSS: scales to any width, no library.
 */
export const ExpectedActualChart: React.FC<{bars: Bar[]; max: number; title: string}> = ({bars, max, title}) => {
  if (bars.length === 0) return <p data-testid="chart-empty" className="rounded-2xl border border-dashed border-[#183B2B]/25 bg-white p-4 text-sm">No rows match the filters, so there is nothing to chart.</p>;
  const w = (v: number) => `${max > 0 ? Math.max(1, Math.round((v / max) * 100)) : 0}%`;
  return (
    <figure role="group" aria-labelledby="chart-title" className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-3" data-testid="yield-chart">
      <figcaption id="chart-title" className="font-display text-lg font-extrabold text-[#183B2B]">{title}</figcaption>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#183B2B]" aria-label="Chart legend">
        <li className="inline-flex items-center gap-2"><span aria-hidden className="inline-block w-6 h-3 rounded-sm border-2 border-dashed border-[#183B2B] bg-[#F3F8F0]" /> Expected (MT)</li>
        <li className="inline-flex items-center gap-2"><span aria-hidden className="inline-block w-6 h-3 rounded-sm bg-[#16803C]" /> Actual (MT)</li>
      </ul>
      <ol className="space-y-4">
        {bars.map((b) => (
          <li key={b.id} data-bar={b.id} data-expected={b.expected} data-actual={b.actual} className="space-y-1">
            <p className="text-sm font-bold text-[#183B2B]">{b.label} <span className="font-normal text-[#183B2B]/80">· actual is {b.pct}% of expected</span></p>
            <div className="flex items-center gap-2"><div className="h-5 rounded-sm border-2 border-dashed border-[#183B2B] bg-[#F3F8F0]" style={{width: w(b.expected)}} aria-hidden /><span className="text-xs font-semibold text-[#183B2B] tabular-nums">Expected {nf.format(b.expected)}</span></div>
            <div className="flex items-center gap-2"><div className="h-5 rounded-sm bg-[#16803C]" style={{width: w(b.actual)}} aria-hidden /><span className="text-xs font-semibold text-[#0F5C2A] tabular-nums">Actual {nf.format(b.actual)}</span></div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-[#183B2B]/75">The table of production figures shows the same numbers. Synthetic data.</p>
    </figure>
  );
};

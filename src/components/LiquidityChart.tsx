import React, { useEffect, useState } from 'react';

interface LiquidityDay {
  date: string;
  time: string;
  closingBalance: number;
  overnightHibor: number | null;
  hiborFixing1m: number | null;
  baseRate: number | null;
}

type Range = '1m' | '3m';

interface LiquidityHistory {
  days: LiquidityDay[];
  failed: number;
  source: string;
}

const RANGE_LABELS: Record<Range, string> = { '1m': '1M', '3m': '3M' };

// Signed change, e.g. "+612" or "−38 bp"
function signed(value: number, suffix = ''): string {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('en-US')}${suffix}`;
}

const bp = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a - b) * 100));

const WIDTH = 280;
const HEIGHT = 84;
const PAD = { top: 6, right: 4, bottom: 4, left: 4 };

function scale(values: number[], lo: number, hi: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (v: number) => hi - ((v - min) / span) * (hi - lo);
}

function linePath(points: [number, number][]) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Daily HKMA interbank liquidity, read by the server from the HKMA Daily
// Monetary Statistics pages. Only figures stated on those pages are plotted.
export const LiquidityChart: React.FC = () => {
  const [range, setRange] = useState<Range>('1m');
  const [histories, setHistories] = useState<Partial<Record<Range, LiquidityHistory>>>({});
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (histories[range]) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/hkma/liquidity-history?range=${range}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) setHistories(prev => ({ ...prev, [range]: data }));
        else setError(data.error || 'Could not load figures');
      })
      .catch(() => !cancelled && setError('Could not load figures'));
    return () => {
      cancelled = true;
    };
  }, [range]);

  // While a longer range loads, keep showing the one already loaded
  const history = histories[range] ?? histories['1m'] ?? null;
  const loadingRange = !histories[range] && !error;
  const days = history?.days ?? [];
  const x = (i: number) => PAD.left + (days.length > 1 ? (i / (days.length - 1)) * (WIDTH - PAD.left - PAD.right) : 0);

  const balances = days.map(d => d.closingBalance);
  const yBalance = scale(balances, PAD.top, HEIGHT - PAD.bottom);
  const balancePoints = days.map((d, i) => [x(i), yBalance(d.closingBalance)] as [number, number]);

  const rates = days.flatMap(d => [d.overnightHibor, d.hiborFixing1m]).filter((v): v is number => v !== null);
  const yRate = scale(rates, PAD.top, HEIGHT - PAD.bottom);
  const ratePoints = (key: 'overnightHibor' | 'hiborFixing1m') =>
    days.flatMap((d, i) => (d[key] === null ? [] : [[x(i), yRate(d[key]!)] as [number, number]]));

  const shownIndex = hover !== null && hover < days.length ? hover : days.length - 1;
  const shown = days[shownIndex];
  const previous = shownIndex > 0 ? days[shownIndex - 1] : null;

  // Most recent change of the discount window base rate within the range
  let baseRateChange: { from: number; date: string } | null = null;
  for (let i = days.length - 1; i > 0; i--) {
    const [a, b] = [days[i - 1].baseRate, days[i].baseRate];
    if (a !== null && b !== null && a !== b) {
      baseRateChange = { from: a, date: days[i].date };
      break;
    }
  }

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round(((rel - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };

  // Each chart is scaled to its own range, which is stated beside the title
  const chart = (title: string, range: string, children: React.ReactNode) => (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-0.5 font-['JetBrains_Mono'] text-[10px] text-muted">
        <span className="uppercase">{title}</span>
        <span>{range}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto block bg-page rounded border border-wash-strong"
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={title}
      >
        {children}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} stroke="var(--color-muted)" strokeWidth={0.75} strokeDasharray="2 2" />
        )}
      </svg>
    </div>
  );

  return (
    <div id="liquidity-card" className="bg-panel border border-line rounded-lg p-3.5 shadow-xs scroll-mt-28">
      <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-line">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-accent text-lg" aria-hidden="true">show_chart</span>
          <span className="font-['Hanken_Grotesk'] text-[15px] text-ink font-bold">HKMA Interbank Liquidity</span>
        </div>
        <div role="group" aria-label="Chart range" className="flex rounded border border-line overflow-hidden">
          {(Object.keys(RANGE_LABELS) as Range[]).map(r => (
            <button
              key={r}
              onClick={() => {
                setHover(null);
                setRange(r);
              }}
              aria-pressed={range === r}
              className={`px-2.5 min-h-[28px] font-['JetBrains_Mono'] text-[11px] font-semibold transition-colors ${
                range === r ? 'bg-accent text-on-accent' : 'bg-panel-raised text-ink-soft hover:bg-wash'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="font-['Inter'] text-[12px] text-muted mb-2">{error}. Open the HKMA page for the figures.</p>}
      {!error && !history && <p className="font-['Inter'] text-[12px] text-muted">Loading figures from HKMA…</p>}
      {history && loadingRange && (
        <p className="font-['Inter'] text-[11px] text-muted mb-2">
          Loading {range === '3m' ? 'three months' : 'one month'} of daily pages from HKMA; this can take up to a minute the first time…
        </p>
      )}
      {history && days.length < 2 && (
        <p className="font-['Inter'] text-[12px] text-muted">Not enough daily figures could be read to draw a chart.</p>
      )}

      {history && days.length >= 2 && shown && (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-['JetBrains_Mono'] text-[11px] text-ink-soft">{shortDate(shown.date)}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink">
                HK${shown.closingBalance.toLocaleString('en-US')}M
              </span>
              {previous && (
                <span className="font-['JetBrains_Mono'] text-[10px] text-muted">
                  {shown.closingBalance === previous.closingBalance
                    ? `unchanged from ${shortDate(previous.date)}`
                    : `${signed(shown.closingBalance - previous.closingBalance)} vs ${shortDate(previous.date)}`}
                </span>
              )}
            </span>
          </div>

          {chart(
            'Closing balance (HK$M)',
            `${Math.min(...balances).toLocaleString('en-US')} – ${Math.max(...balances).toLocaleString('en-US')}`,
            <>
              <path
                d={`${linePath(balancePoints)} L${x(days.length - 1)},${HEIGHT} L${x(0)},${HEIGHT} Z`}
                fill="var(--color-accent)"
                fillOpacity={0.08}
              />
              <path d={linePath(balancePoints)} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
              {hover !== null && <circle cx={balancePoints[hover][0]} cy={balancePoints[hover][1]} r={2.5} fill="var(--color-accent)" />}
            </>
          )}

          {rates.length > 0 &&
            chart(
              'HIBOR (%)',
              `${Math.min(...rates).toFixed(2)} – ${Math.max(...rates).toFixed(2)}`,
              <>
                <path d={linePath(ratePoints('overnightHibor'))} fill="none" stroke="var(--color-green)" strokeWidth={1.5} />
                <path d={linePath(ratePoints('hiborFixing1m'))} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
              </>
            )}

          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 font-['JetBrains_Mono'] text-[10px]">
            <span className="text-green">
              ● Overnight {shown.overnightHibor !== null ? `${shown.overnightHibor.toFixed(2)}%` : 'n/a'}
              {previous && bp(shown.overnightHibor, previous.overnightHibor) !== null && (
                <span className="text-muted"> ({signed(bp(shown.overnightHibor, previous.overnightHibor)!, ' bp')})</span>
              )}
            </span>
            <span className="text-accent">
              ● 1-month fixing {shown.hiborFixing1m !== null ? `${shown.hiborFixing1m.toFixed(5)}%` : 'n/a'}
              {previous && bp(shown.hiborFixing1m, previous.hiborFixing1m) !== null && (
                <span className="text-muted"> ({signed(bp(shown.hiborFixing1m, previous.hiborFixing1m)!, ' bp')})</span>
              )}
            </span>
          </div>

          {shown.baseRate !== null && (
            <p className="font-['Inter'] text-[12px] text-ink-soft">
              Discount window base rate <strong className="font-semibold text-ink">{shown.baseRate.toFixed(2)}%</strong>
              {baseRateChange && hover === null && (
                <span className="text-muted">, changed from {baseRateChange.from.toFixed(2)}% on {shortDate(baseRateChange.date)}</span>
              )}
            </p>
          )}

          <p className="font-['Inter'] text-[11px] text-muted leading-snug">
            {days.length} business days, {shortDate(days[0].date)} to {shortDate(days[days.length - 1].date)}, as stated on the{' '}
            <a href={history.source} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
              HKMA Daily Monetary Statistics
            </a>{' '}
            pages (figures as at {shown.time} Hong Kong time). Changes are against the previous business day shown.
            {history.failed > 0 && ` ${history.failed} day${history.failed === 1 ? '' : 's'} could not be fetched and ${history.failed === 1 ? 'is' : 'are'} not shown.`}
          </p>
        </div>
      )}
    </div>
  );
};

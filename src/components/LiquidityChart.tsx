import React, { useEffect, useState } from 'react';

interface LiquidityDay {
  date: string;
  time: string;
  closingBalance: number;
  overnightHibor: number | null;
  hiborFixing1m: number | null;
  baseRate: number | null;
}

interface LiquidityHistory {
  days: LiquidityDay[];
  failed: number;
  source: string;
}

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
  const [history, setHistory] = useState<LiquidityHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/hkma/liquidity-history')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) setHistory(data);
        else setError(data.error || 'Could not load figures');
      })
      .catch(() => !cancelled && setError('Could not load figures'));
    return () => {
      cancelled = true;
    };
  }, []);

  const days = history?.days ?? [];
  const x = (i: number) => PAD.left + (days.length > 1 ? (i / (days.length - 1)) * (WIDTH - PAD.left - PAD.right) : 0);

  const balances = days.map(d => d.closingBalance);
  const yBalance = scale(balances, PAD.top, HEIGHT - PAD.bottom);
  const balancePoints = days.map((d, i) => [x(i), yBalance(d.closingBalance)] as [number, number]);

  const rates = days.flatMap(d => [d.overnightHibor, d.hiborFixing1m]).filter((v): v is number => v !== null);
  const yRate = scale(rates, PAD.top, HEIGHT - PAD.bottom);
  const ratePoints = (key: 'overnightHibor' | 'hiborFixing1m') =>
    days.flatMap((d, i) => (d[key] === null ? [] : [[x(i), yRate(d[key]!)] as [number, number]]));

  const shown = hover !== null ? days[hover] : days[days.length - 1];

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round(((rel - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };

  // Each chart is scaled to its own range, which is stated beside the title
  const chart = (title: string, range: string, children: React.ReactNode) => (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-0.5 font-['JetBrains_Mono'] text-[10px] text-[#56636B]">
        <span className="uppercase">{title}</span>
        <span>{range}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto block bg-[#EEF3EF] rounded border border-[#DCE4DF]"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={title}
      >
        {children}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} stroke="#56636B" strokeWidth={0.75} strokeDasharray="2 2" />
        )}
      </svg>
    </div>
  );

  return (
    <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3.5 shadow-xs">
      <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-[#D3DDD7]">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[#1F4E79] text-lg">show_chart</span>
          <span className="font-['Hanken_Grotesk'] text-[15px] text-[#1D2630] font-bold">HKMA Interbank Liquidity</span>
        </div>
        <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">Daily</span>
      </div>

      {error && <p className="font-['Inter'] text-[12px] text-[#56636B]">{error}. Open the HKMA page for the figures.</p>}
      {!error && !history && <p className="font-['Inter'] text-[12px] text-[#56636B]">Loading figures from HKMA…</p>}
      {history && days.length < 2 && (
        <p className="font-['Inter'] text-[12px] text-[#56636B]">Not enough daily figures could be read to draw a chart.</p>
      )}

      {history && days.length >= 2 && shown && (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#3C4852]">{shortDate(shown.date)}</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1D2630]">
              HK${shown.closingBalance.toLocaleString('en-US')}M
            </span>
          </div>

          {chart(
            'Closing balance (HK$M)',
            `${Math.min(...balances).toLocaleString('en-US')} – ${Math.max(...balances).toLocaleString('en-US')}`,
            <>
              <path
                d={`${linePath(balancePoints)} L${x(days.length - 1)},${HEIGHT} L${x(0)},${HEIGHT} Z`}
                fill="#1F4E79"
                fillOpacity={0.08}
              />
              <path d={linePath(balancePoints)} fill="none" stroke="#1F4E79" strokeWidth={1.5} />
              {hover !== null && <circle cx={balancePoints[hover][0]} cy={balancePoints[hover][1]} r={2.5} fill="#1F4E79" />}
            </>
          )}

          {rates.length > 0 &&
            chart(
              'HIBOR (%)',
              `${Math.min(...rates).toFixed(2)} – ${Math.max(...rates).toFixed(2)}`,
              <>
                <path d={linePath(ratePoints('overnightHibor'))} fill="none" stroke="#A8862A" strokeWidth={1.5} />
                <path d={linePath(ratePoints('hiborFixing1m'))} fill="none" stroke="#1F4E79" strokeWidth={1.5} />
              </>
            )}

          <div className="flex items-center justify-between font-['JetBrains_Mono'] text-[10px]">
            <span className="text-[#6E5410]">
              ● Overnight {shown.overnightHibor !== null ? `${shown.overnightHibor.toFixed(2)}%` : 'n/a'}
            </span>
            <span className="text-[#1F4E79]">
              ● 1-month fixing {shown.hiborFixing1m !== null ? `${shown.hiborFixing1m.toFixed(5)}%` : 'n/a'}
            </span>
          </div>

          <p className="font-['Inter'] text-[11px] text-[#56636B] leading-snug">
            {days.length} business days, {shortDate(days[0].date)} to {shortDate(days[days.length - 1].date)}, as stated on the{' '}
            <a href={history.source} target="_blank" rel="noopener noreferrer" className="text-[#1F4E79] hover:underline">
              HKMA Daily Monetary Statistics
            </a>{' '}
            pages (figures as at {shown.time} Hong Kong time).
            {history.failed > 0 && ` ${history.failed} day${history.failed === 1 ? '' : 's'} could not be fetched and ${history.failed === 1 ? 'is' : 'are'} not shown.`}
          </p>
        </div>
      )}
    </div>
  );
};

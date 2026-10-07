import React from 'react';
import { DeadlineItem, RegulatoryNotice } from '../types/regulatory';

interface NextUpStripProps {
  nextDeadline?: DeadlineItem;
  liquidity?: RegulatoryNotice;
  onOpenNotice: (id: string) => void;
}

// Phones show the side columns last, so the next date and the latest HKMA
// liquidity figure are summarised at the top of the feed
export const NextUpStrip: React.FC<NextUpStripProps> = ({ nextDeadline, liquidity, onOpenNotice }) => {
  if (!nextDeadline && !liquidity) return null;
  const balance = liquidity?.statusBadge?.text.replace(/^Closing Bal:\s*/, '');

  return (
    <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
      {nextDeadline && (
        <button
          onClick={() => nextDeadline.noticeId && onOpenNotice(nextDeadline.noticeId)}
          className="text-left bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 shadow-xs"
        >
          <span className="min-w-0">
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#56636B] block">Next date</span>
            <span className="font-['Inter'] text-[13px] font-semibold text-[#1D2630] line-clamp-2">{nextDeadline.title}</span>
          </span>
          <span className="text-right shrink-0">
            <span className={`font-['Hanken_Grotesk'] text-[18px] font-bold block ${nextDeadline.textColorClass}`}>
              {nextDeadline.daysRemaining === 0 ? 'Today' : `${nextDeadline.daysRemaining}d`}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">{nextDeadline.dateStr}</span>
          </span>
        </button>
      )}
      {liquidity && balance && (
        <a
          href="#liquidity-card"
          className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 shadow-xs no-underline"
        >
          <span className="min-w-0">
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#56636B] block">HKMA aggregate balance</span>
            <span className="font-['Inter'] text-[12px] text-[#3C4852]">{liquidity.ref.replace('HKMA Daily Monetary Statistics ', 'As at ')} · see chart</span>
          </span>
          <span className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1D2630] shrink-0">{balance}</span>
        </a>
      )}
    </div>
  );
};

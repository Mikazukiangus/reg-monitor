import React from 'react';
import { DeadlineItem } from '../types/regulatory';

interface NextUpStripProps {
  nextDeadline?: DeadlineItem;
  onOpenNotice: (id: string) => void;
}

// Phones show the side columns last, so the next date is summarised at the
// top of the feed
export const NextUpStrip: React.FC<NextUpStripProps> = ({ nextDeadline, onOpenNotice }) => {
  if (!nextDeadline) return null;

  return (
    <button
      onClick={() => nextDeadline.noticeId && onOpenNotice(nextDeadline.noticeId)}
      className="lg:hidden text-left bg-panel border border-line rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 shadow-xs"
    >
      <span className="min-w-0">
        <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-muted block">Next date</span>
        <span className="font-['Inter'] text-[13px] font-semibold text-ink line-clamp-2">{nextDeadline.title}</span>
      </span>
      <span className="text-right shrink-0">
        <span className={`font-['Hanken_Grotesk'] text-[18px] font-bold block ${nextDeadline.textColorClass}`}>
          {nextDeadline.daysRemaining === 0 ? 'Today' : `${nextDeadline.daysRemaining}d`}
        </span>
        <span className="font-['JetBrains_Mono'] text-[10px] text-muted">{nextDeadline.dateStr}</span>
      </span>
    </button>
  );
};

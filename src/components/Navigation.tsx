import React from 'react';
import { RegulatoryNotice } from '../../shared/regulatory';

export type ActiveTab =
  | 'feed'
  | 'radar'
  | 'horizon'
  | 'enforcement'
  | 'alert-rules';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  wireItems: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

const SEVERITY_DOT: Record<RegulatoryNotice['severity'], string> = {
  critical: 'bg-orange',
  high: 'bg-cream',
  info: 'bg-blue'
};

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  wireItems,
  onSelectNotice
}) => {
  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-page">
      {/* Tab Navigation Row */}
      <div className="hidden md:flex h-10 w-full px-4 sm:px-6 bg-wash border-b border-line items-center justify-between overflow-x-auto scrollbar-none">
        <nav aria-label="Sections" className="flex items-center gap-1.5 h-full shrink-0">
          <button
            onClick={() => onTabChange('feed')}
            aria-current={activeTab === 'feed' ? 'page' : undefined}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'feed'
                ? 'bg-accent text-on-tab shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-wash-strong'
            }`}
          >
            Live Regulatory Feed
          </button>

          <button
            onClick={() => onTabChange('radar')}
            aria-current={activeTab === 'radar' ? 'page' : undefined}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'radar'
                ? 'bg-accent text-on-tab shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-wash-strong'
            }`}
          >
            APAC Regulatory Radar
          </button>

          <button
            onClick={() => onTabChange('horizon')}
            aria-current={activeTab === 'horizon' ? 'page' : undefined}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'horizon'
                ? 'bg-accent text-on-tab shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-wash-strong'
            }`}
          >
            Impact &amp; Horizon Tracker
          </button>

          <button
            onClick={() => onTabChange('enforcement')}
            aria-current={activeTab === 'enforcement' ? 'page' : undefined}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'enforcement'
                ? 'bg-accent text-on-tab shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-wash-strong'
            }`}
          >
            Enforcement &amp; Sanctions
          </button>

          <button
            onClick={() => onTabChange('alert-rules')}
            aria-current={activeTab === 'alert-rules' ? 'page' : undefined}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'alert-rules'
                ? 'bg-accent text-on-tab shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-wash-strong'
            }`}
          >
            Custom Alert Rules
          </button>
        </nav>

      </div>

      {/* Real-Time Wire Banner; phones show one cut-off headline, so they leave it to the feed */}
      <section aria-label="Latest notices" className="hidden md:flex h-8 w-full px-4 sm:px-6 bg-wash-mid border-b border-line items-center overflow-hidden">
        <div className="flex items-center gap-1 shrink-0 pr-4 border-r border-line-strong mr-4">
          <span className="material-symbols-outlined text-accent text-sm animate-pulse" aria-hidden="true">
            bolt
          </span>
          <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-muted uppercase tracking-wider">
            Latest
          </span>
        </div>

        <div className="flex items-center gap-6 overflow-x-hidden whitespace-nowrap text-ink-soft font-['Inter'] text-[12px]">
          {wireItems.length === 0 && <span className="text-muted">Waiting for first sync...</span>}
          {wireItems.map((n, idx) => (
            <React.Fragment key={n.id}>
              {idx > 0 && <span className="text-muted" aria-hidden="true">•</span>}
              <button
                onClick={() => onSelectNotice(n.id)}
                className="flex items-center gap-1.5 cursor-pointer hover:text-ink transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[n.severity]}`}></span>
                <strong className="text-ink font-medium">{n.regulator}:</strong> {n.title} ({n.issuedTimeAgo})
              </button>
            </React.Fragment>
          ))}
        </div>
      </section>
    </div>
  );
};

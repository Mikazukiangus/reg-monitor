import React from 'react';
import { STATUS_STYLES } from './modals/LiveEndpointsModal';
import type { EndpointMetric } from '../../shared/regulatory';

interface FooterProps {
  onOpenAuditLog: () => void;
  onOpenMethodology: () => void;
  onOpenSecurity: () => void;
  endpoints: EndpointMetric[];
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAuditLog,
  onOpenMethodology,
  onOpenSecurity,
  endpoints
}) => {
  const operationalCount = endpoints.filter(e => e.status === 'Operational').length;
  const checking = endpoints.some(e => e.status === 'Checking');
  const tone = checking ? STATUS_STYLES.Checking : operationalCount === endpoints.length ? STATUS_STYLES.Operational : STATUS_STYLES.Degraded;

  return (
    <footer className="w-full bg-wash border-t border-line text-muted py-6 mt-12">
      <div className="w-full px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left Status & Latency Wire */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${tone.dot}`}></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-ink-soft font-medium">
              {checking ? 'Checking regulatory sources...' : `${operationalCount} of ${endpoints.length} regulatory sources operational`}
            </span>
          </div>

          <span className="text-line-strong hidden sm:inline">|</span>

          <span className="max-md:hidden font-['Inter'] text-[12px] text-muted">
            Latencies:{' '}
            {endpoints
              .map(ep => `${ep.jurisdiction} (${ep.pingMs !== null ? `${ep.pingMs}ms` : ep.status === 'Checking' ? '…' : 'no response'})`)
              .join(' • ')}
          </span>
        </div>

        {/* Right Legal & Methodology Links */}
        <div className="flex flex-wrap items-center gap-4 font-['Inter'] text-[11px] font-semibold">
          <button
            onClick={onOpenMethodology}
            className="text-ink-soft hover:text-ink transition-colors"
          >
            Statutory Methodology
          </button>
          <button
            onClick={onOpenAuditLog}
            className="text-ink-soft hover:text-ink transition-colors"
          >
            Audit Log
          </button>
          <button
            onClick={onOpenSecurity}
            className="text-ink-soft hover:text-ink transition-colors"
          >
            Security &amp; Encryption
          </button>
          <span className="text-muted">© 2026 RegSonar</span>
        </div>
      </div>
    </footer>
  );
};

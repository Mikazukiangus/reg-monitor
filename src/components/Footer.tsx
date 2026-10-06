import React from 'react';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';

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
    <footer className="w-full bg-[#F5F1E8] border-t border-[#E5DFD5] text-[#857F74] py-6 mt-12">
      <div className="w-full px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left Status & Latency Wire */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${tone.dot}`}></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#57534E] font-medium">
              {checking ? 'Checking regulatory sources...' : `${operationalCount} of ${endpoints.length} regulatory sources operational`}
            </span>
          </div>

          <span className="text-[#D8D0C2] hidden sm:inline">|</span>

          <span className="font-['Inter'] text-[12px] text-[#857F74]">
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
            className="text-[#57534E] hover:text-[#1E1B18] transition-colors"
          >
            Statutory Methodology
          </button>
          <button
            onClick={onOpenAuditLog}
            className="text-[#57534E] hover:text-[#1E1B18] transition-colors"
          >
            Audit Log
          </button>
          <button
            onClick={onOpenSecurity}
            className="text-[#57534E] hover:text-[#1E1B18] transition-colors"
          >
            Security &amp; Encryption
          </button>
          <span className="text-[#857F74]">© 2026 RegSonar Global Inc.</span>
        </div>
      </div>
    </footer>
  );
};

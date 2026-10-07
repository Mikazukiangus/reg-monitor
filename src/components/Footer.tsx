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
    <footer className="w-full bg-[#E3EBE6] border-t border-[#D3DDD7] text-[#56636B] py-6 mt-12">
      <div className="w-full px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left Status & Latency Wire */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${tone.dot}`}></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#3C4852] font-medium">
              {checking ? 'Checking regulatory sources...' : `${operationalCount} of ${endpoints.length} regulatory sources operational`}
            </span>
          </div>

          <span className="text-[#C5D2CA] hidden sm:inline">|</span>

          <span className="font-['Inter'] text-[12px] text-[#56636B]">
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
            className="text-[#3C4852] hover:text-[#1D2630] transition-colors"
          >
            Statutory Methodology
          </button>
          <button
            onClick={onOpenAuditLog}
            className="text-[#3C4852] hover:text-[#1D2630] transition-colors"
          >
            Audit Log
          </button>
          <button
            onClick={onOpenSecurity}
            className="text-[#3C4852] hover:text-[#1D2630] transition-colors"
          >
            Security &amp; Encryption
          </button>
          <span className="text-[#56636B]">© 2026 RegSonar</span>
        </div>
      </div>
    </footer>
  );
};

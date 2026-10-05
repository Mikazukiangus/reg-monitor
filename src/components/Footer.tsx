import React from 'react';

interface FooterProps {
  onOpenAuditLog: () => void;
  onOpenMethodology: () => void;
  onOpenSecurity: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAuditLog,
  onOpenMethodology,
  onOpenSecurity
}) => {
  return (
    <footer className="w-full bg-[#F5F1E8] border-t border-[#E5DFD5] text-[#857F74] py-6 mt-12">
      <div className="w-full px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left Status & Latency Wire */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse"></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#57534E] font-medium">
              All Regulatory Gateways Operational
            </span>
          </div>

          <span className="text-[#D8D0C2] hidden sm:inline">|</span>

          <span className="font-['Inter'] text-[12px] text-[#857F74]">
            Latencies: SG (12ms) • HK (14ms) • AU (28ms) • JP (32ms)
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
          <span className="text-[#857F74]">© 2025 RegSonar Global Inc.</span>
        </div>
      </div>
    </footer>
  );
};

import React, { useState } from 'react';
import { RADAR_MATRIX } from '../../data/regulatoryData';

export const RadarScreen: React.FC = () => {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">radar</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1E1B18]">
              APAC Multi-Jurisdiction Regulatory Radar
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-[#57534E]">
            Comparative supervisory posture and statutory divergence across Singapore, Hong Kong, Australia, and Japan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#15803D] bg-[#DCFCE7] border border-[#BBF7D0] px-2.5 py-1 rounded font-bold flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse"></span>
            Harmonization Index: 68% Convergence
          </span>
        </div>
      </div>

      {/* Comparative Grid */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px] font-['Inter'] border-collapse">
            <thead>
              <tr className="bg-[#F5F1E8] border-b border-[#E5DFD5] font-['JetBrains_Mono'] text-[11px] text-[#1E1B18]">
                <th className="p-3.5 pl-5 min-w-[200px] font-bold">REGULATORY PILLAR</th>
                <th className="p-3.5 min-w-[220px] font-bold">SINGAPORE (MAS)</th>
                <th className="p-3.5 min-w-[220px] font-bold">HONG KONG (HKMA/SFC)</th>
                <th className="p-3.5 min-w-[220px] font-bold">AUSTRALIA (ASIC)</th>
                <th className="p-3.5 min-w-[220px] pr-5 font-bold">JAPAN (JFSA)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5]">
              {RADAR_MATRIX.map((row) => (
                <tr
                  key={row.domain}
                  className="hover:bg-[#FAF8F5] transition-colors"
                  onClick={() => setSelectedDomain(selectedDomain === row.domain ? null : row.domain)}
                >
                  <td className="p-3.5 pl-5 font-bold text-[#1E1B18] align-top">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0D5C63]"></span>
                      <span>{row.domain}</span>
                    </div>
                  </td>

                  <td className="p-3.5 align-top">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border mb-1 ${row.mas.color}`}>
                      {row.mas.level}
                    </span>
                    <p className="text-[#57534E] text-[11px] leading-relaxed">
                      {row.mas.desc}
                    </p>
                  </td>

                  <td className="p-3.5 align-top">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border mb-1 ${row.hkma.color}`}>
                      {row.hkma.level}
                    </span>
                    <p className="text-[#57534E] text-[11px] leading-relaxed">
                      {row.hkma.desc}
                    </p>
                  </td>

                  <td className="p-3.5 align-top">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border mb-1 ${row.asic.color}`}>
                      {row.asic.level}
                    </span>
                    <p className="text-[#57534E] text-[11px] leading-relaxed">
                      {row.asic.desc}
                    </p>
                  </td>

                  <td className="p-3.5 pr-5 align-top">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border mb-1 ${row.jfsa.color}`}>
                      {row.jfsa.level}
                    </span>
                    <p className="text-[#57534E] text-[11px] leading-relaxed">
                      {row.jfsa.desc}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Divergence Insight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl space-y-2 shadow-xs">
          <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#DC2626] uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">warning</span>
            Highest Frictional Divergence: Digital Asset Custody
          </span>
          <p className="text-[12px] text-[#57534E] leading-relaxed">
            While Singapore requires explicit board CISO accountability and 4h RTO, Japan mandates 95% cold storage with 100% hot-float fiat capital reserves. Dual-licensed brokerages must compartmentalize infrastructure to avoid duplicate capital locks.
          </p>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl space-y-2 shadow-xs">
          <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#15803D] uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">verified</span>
            Highest Convergence: Climate Disclosure Baselines
          </span>
          <p className="text-[12px] text-[#57534E] leading-relaxed">
            All 4 jurisdictions are synchronizing reporting requirements around the ISSB (IFRS S1 and S2) framework, with mandatory phased rollouts across FY25–FY27 for institutional capital managers.
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ENFORCEMENT_RECORDS } from '../../data/regulatoryData';

export const EnforcementScreen: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegulator, setSelectedRegulator] = useState('ALL');

  const filtered = ENFORCEMENT_RECORDS.filter((rec) => {
    const matchesReg = selectedRegulator === 'ALL' || rec.regulator.includes(selectedRegulator);
    const matchesSearch =
      rec.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.ref.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesReg && matchesSearch;
  });

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#DC2626] text-2xl">gavel</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1E1B18]">
              APAC Enforcement &amp; Sanctions Registry
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-[#57534E]">
            Authoritative tracking of statutory civil penalties, supervisory reprimands, and mandatory business improvement orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#FAF7F2] border border-[#E5DFD5] rounded-lg text-right">
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] block font-medium">Penalties Monitored</span>
            <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#DC2626]">$42.8M USD Equiv.</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#FFFFFF] p-3 rounded-lg border border-[#E5DFD5] shadow-xs">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-2 text-[#857F74] text-lg pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search sanctioned entities, docket numbers, violations..."
            className="w-full h-8 pl-9 pr-3 bg-[#FAF8F5] border border-[#E5DFD5] rounded text-[#1E1B18] placeholder:text-[#857F74] text-[12px] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#0D5C63]"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] font-medium">Filter Agency:</span>
          {['ALL', 'ASIC', 'MAS', 'HKMA', 'JFSA'].map((agency) => (
            <button
              key={agency}
              onClick={() => setSelectedRegulator(agency)}
              className={`px-2.5 py-1 rounded text-[11px] font-['JetBrains_Mono'] font-bold transition-colors ${
                selectedRegulator === agency
                  ? 'bg-[#0D5C63] text-white shadow-2xs'
                  : 'bg-[#FAF8F5] border border-[#E5DFD5] text-[#57534E] hover:text-[#1E1B18]'
              }`}
            >
              {agency}
            </button>
          ))}
        </div>
      </div>

      {/* Enforcement Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-5 bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl hover:bg-[#FAF8F5] transition-colors flex flex-col justify-between space-y-3 shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between text-[11px] font-['JetBrains_Mono'] mb-2">
                <span className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5] font-bold">
                  {item.regulator} • {item.ref}
                </span>
                <span className="text-[#857F74]">{item.date}</span>
              </div>

              <h3 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1E1B18] mb-1">
                {item.entity}
              </h3>

              <div className="p-2.5 bg-[#FAF7F2] border border-[#E5DFD5] rounded-lg mb-2 flex items-center justify-between">
                <div>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] block font-medium">Action &amp; Sanction</span>
                  <span className="text-[12px] font-bold text-[#DC2626]">{item.penalty}</span>
                </div>
                <span className="px-2 py-0.5 bg-[#FFFFFF] border border-[#E5DFD5] rounded text-[10px] text-[#0D5C63] font-['JetBrains_Mono'] font-bold">
                  {item.status}
                </span>
              </div>

              <p className="font-['Inter'] text-[12px] text-[#57534E] leading-relaxed">
                {item.summary}
              </p>
            </div>

            <div className="pt-2 border-t border-[#E5DFD5] flex items-center justify-between">
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                Category: <strong className="text-[#1E1B18]">{item.category}</strong>
              </span>
              <button className="px-3 py-1 bg-[#FAF8F5] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#1E1B18] text-[11px] rounded flex items-center gap-1 font-semibold shadow-2xs">
                <span className="material-symbols-outlined text-sm">visibility</span>
                Case Summary
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

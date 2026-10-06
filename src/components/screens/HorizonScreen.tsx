import React, { useState } from 'react';

interface HorizonEvent {
  id: string;
  date: string;
  quarter: string;
  regulator: string;
  jurisdiction: string;
  title: string;
  category: string;
  impactScore: number;
  status: 'Critical Deadline' | 'Consultation Close' | 'Phase-in Starts' | 'Standard Effective';
  actionRequired: string;
}

export const HorizonScreen: React.FC = () => {
  const [filterQuarter, setFilterQuarter] = useState<string>('all');

  const events: HorizonEvent[] = [
    {
      id: 'h1',
      date: '2026-11-30',
      quarter: 'Q4 2026',
      regulator: 'MAS',
      jurisdiction: 'Singapore',
      title: 'DPT Technology Risk Management & 4h RTO Implementation Deadline',
      category: 'FinTech & Digital Assets',
      impactScore: 9.4,
      status: 'Critical Deadline',
      actionRequired: 'Board sign-off on CISO accountability charter and third-party penetration audit.'
    },
    {
      id: 'h2',
      date: '2026-12-15',
      quarter: 'Q4 2026',
      regulator: 'JFSA',
      jurisdiction: 'Japan',
      title: 'Consultation Period Closes on HFT Order-to-Trade Ratios',
      category: 'Banking & Capital Markets',
      impactScore: 7.6,
      status: 'Consultation Close',
      actionRequired: 'Submit industry commentary regarding automated circuit-halt exceptions.'
    },
    {
      id: 'h3',
      date: '2026-12-31',
      quarter: 'Q4 2026',
      regulator: 'HKMA',
      jurisdiction: 'Hong Kong',
      title: 'Stablecoin Licensing & Cold-Storage Segregation Mandate',
      category: 'FinTech & Digital Assets',
      impactScore: 8.9,
      status: 'Critical Deadline',
      actionRequired: 'File application dossier with proof of segregated fiat reserves in HK licensed banks.'
    },
    {
      id: 'h4',
      date: '2027-01-15',
      quarter: 'Q1 2027',
      regulator: 'MAS',
      jurisdiction: 'Singapore',
      title: 'Single Family Office (SFO) S13O/U Strict Beneficial Ownership Verification',
      category: 'AML/CFT & Sanctions',
      impactScore: 9.1,
      status: 'Critical Deadline',
      actionRequired: 'Recertify all tier-1 PEP connections across global family office structures.'
    },
    {
      id: 'h5',
      date: '2027-02-28',
      quarter: 'Q1 2027',
      regulator: 'ASIC',
      jurisdiction: 'Australia',
      title: 'ASRS Climate Disclosure Group 1 Mandatory Baseline Phase-in',
      category: 'ESG & Sustainability',
      impactScore: 8.6,
      status: 'Phase-in Starts',
      actionRequired: 'Implement audited Scope 1 & 2 carbon ledgers for all entities with >$500M turnover.'
    },
    {
      id: 'h6',
      date: '2027-03-15',
      quarter: 'Q1 2027',
      regulator: 'HKMA',
      jurisdiction: 'Hong Kong',
      title: 'ICT Third-Party Cloud Concentration & Vendor Resilience Consultation Closure',
      category: 'Banking & Capital Markets',
      impactScore: 9.2,
      status: 'Consultation Close',
      actionRequired: 'Complete vendor concentration impact review and multi-cloud secondary switchover testing.'
    },
    {
      id: 'h7',
      date: '2027-03-31',
      quarter: 'Q1 2027',
      regulator: 'MAS',
      jurisdiction: 'Singapore',
      title: 'Agentic AI & Autonomous Algorithmic Credit Decisioning Compliance Deadline',
      category: 'AI Governance & Ethics',
      impactScore: 9.6,
      status: 'Critical Deadline',
      actionRequired: 'File mandatory algorithmic kill-switch architectures and CRO model validation declarations with MAS.'
    }
  ];

  const filteredEvents = filterQuarter === 'all'
    ? events
    : events.filter(e => e.quarter === filterQuarter);

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">timeline</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1E1B18]">
              Impact &amp; Statutory Horizon Tracker
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-[#57534E]">
            Forward roadmap of statutory effective dates, supervisory consultation closures, and compliance phase-ins.
          </p>
        </div>

        {/* Quarter Filter Chips */}
        <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1 rounded-lg border border-[#E5DFD5]">
          {['all', 'Q4 2026', 'Q1 2027'].map((q) => (
            <button
              key={q}
              onClick={() => setFilterQuarter(q)}
              className={`px-3 py-1 rounded text-[11px] font-['JetBrains_Mono'] font-bold transition-colors ${
                filterQuarter === q
                  ? 'bg-[#0D5C63] text-white shadow-2xs'
                  : 'text-[#57534E] hover:text-[#1E1B18]'
              }`}
            >
              {q.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="space-y-4">
        {filteredEvents.map((evt) => (
          <div
            key={evt.id}
            className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl hover:bg-[#FAF8F5] transition-colors relative flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
          >
            <div className="flex items-start gap-4">
              {/* Date Block */}
              <div className="shrink-0 w-24 p-2 bg-[#FAF7F2] border border-[#E5DFD5] rounded-lg text-center font-['JetBrains_Mono']">
                <span className="text-[10px] text-[#857F74] block font-medium">{evt.quarter}</span>
                <span className="text-[15px] font-bold text-[#1E1B18] block">{evt.date.split('-').slice(1).join('/')}</span>
                <span className="text-[10px] text-[#0D5C63] font-bold">{evt.regulator}</span>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border ${
                      evt.status === 'Critical Deadline'
                        ? 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]'
                        : evt.status === 'Consultation Close'
                        ? 'bg-[#E6F4F4] text-[#0D5C63] border-[#B2DFDB]'
                        : 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]'
                    }`}
                  >
                    {evt.status}
                  </span>
                  <span className="text-[11px] font-['JetBrains_Mono'] text-[#857F74]">
                    {evt.jurisdiction} • {evt.category}
                  </span>
                </div>

                <h3 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1E1B18]">
                  {evt.title}
                </h3>

                <p className="font-['Inter'] text-[12px] text-[#57534E]">
                  <strong className="text-[#1E1B18] font-semibold">Immediate Action: </strong>
                  {evt.actionRequired}
                </p>
              </div>
            </div>

            {/* Score & Badge */}
            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
              <div className="text-right">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] block font-medium">Risk Impact</span>
                <span className="font-['JetBrains_Mono'] text-[17px] font-bold text-[#DC2626]">
                  {evt.impactScore}/10
                </span>
              </div>
              <button className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#1E1B18] text-[11px] font-semibold rounded shadow-2xs">
                Add to Calendar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

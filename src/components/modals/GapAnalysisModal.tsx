import React, { useState } from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface GapAnalysisModalProps {
  notice: RegulatoryNotice;
  onClose: () => void;
}

interface ChecklistItem {
  id: string;
  requirement: string;
  owner: string;
  deadline: string;
  status: 'Compliant' | 'In-Progress' | 'Action-Required';
  notes: string;
}

export const GapAnalysisModal: React.FC<GapAnalysisModalProps> = ({ notice, onClose }) => {
  // Start from the dated sentences in the source document; users add the rest
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() =>
    (notice?.keyPoints?.facts || []).map((fact, idx) => ({
      id: `fact-${idx}`,
      requirement: fact.text,
      owner: 'Unassigned',
      deadline: fact.date || '',
      status: 'Action-Required' as const,
      notes: 'Quoted from source document'
    }))
  );
  const [newRequirement, setNewRequirement] = useState('');
  const [newOwner, setNewOwner] = useState('Custody Operations');

  const handleStatusChange = (id: string, newStatus: ChecklistItem['status']) => {
    setChecklist(prev =>
      prev.map(item => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequirement.trim()) return;
    const newItem: ChecklistItem = {
      id: `item-${Date.now()}`,
      requirement: newRequirement,
      owner: newOwner,
      deadline: '',
      status: 'Action-Required',
      notes: ''
    };
    setChecklist([...checklist, newItem]);
    setNewRequirement('');
  };

  const handleExportGapReport = () => {
    const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ['Requirement', 'Owner', 'Deadline', 'Status', 'Notes'],
      ...checklist.map(item => [item.requirement, item.owner, item.deadline, item.status, item.notes])
    ];
    const header = `# ${notice.regulator}: ${notice.title}\n# Source: ${notice.dossierUrl || 'n/a'}\n`;
    const blob = new Blob([header + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RegSonar_Gap_Checklist_${notice.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FBFCFA] border border-[#C5D2CA] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-[#E3EBE6] border-b border-[#D3DDD7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1F4E79] text-2xl">assignment</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[18px] text-[#1D2630] font-bold">
                Institutional Gap Analysis &amp; Action Matrix
              </h2>
              <p className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
                {notice.regulator} • {notice.ref} • Date: {notice.statutoryDeadline || 'None found in source'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#56636B] hover:text-[#1D2630] hover:bg-[#DCE4DF] transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Summary Banner */}
          <div className="p-3.5 bg-[#EEF3EF] border border-[#DCE4DF] rounded-lg">
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#1F4E79] uppercase font-bold tracking-wider block mb-1">
              Active Regulatory Matter
            </span>
            <h3 className="font-['Hanken_Grotesk'] text-[15px] font-bold text-[#1D2630] mb-1">
              {notice.title}
            </h3>
            <div className="flex flex-wrap gap-2 text-[11px] text-[#3C4852] font-['JetBrains_Mono'] mt-2">
              <span className="px-2 py-0.5 bg-[#FBFCFA] rounded border border-[#D3DDD7]">
                Impact Score: {notice.impactScore}/10
              </span>
              <span className="px-2 py-0.5 bg-[#FBFCFA] rounded border border-[#D3DDD7]">
                Jurisdiction: {notice.jurisdiction}
              </span>
              <span className="px-2 py-0.5 bg-[#F4DCD3] text-[#8A3524] rounded border border-[#E2B5A6] font-semibold">
                SEAR CISO Liability: Active
              </span>
            </div>
          </div>

          {/* Checklist Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1D2630]">
                Statutory Obligations &amp; Readiness Checklist
              </span>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#2F6249] font-bold">
                {checklist.filter(c => c.status === 'Compliant').length} of {checklist.length} Controls Verified
              </span>
            </div>

            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#EEF3EF] border border-[#D3DDD7] rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[#E3EBE6] transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-['Inter'] text-[13px] font-semibold text-[#1D2630]">
                      {item.requirement}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
                      <span>Owner: <strong className="text-[#1D2630]">{item.owner}</strong></span>
                      <span>Target: <strong className="text-[#1F4E79]">{item.deadline || "Not set"}</strong></span>
                      <span className="text-[#3C4852] italic">{item.notes}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value as ChecklistItem['status'])}
                      className={`text-[11px] font-['JetBrains_Mono'] font-bold px-2.5 py-1 rounded border cursor-pointer focus:outline-none ${
                        item.status === 'Compliant'
                          ? 'bg-[#D7E9DD] text-[#2F6249] border-[#ABCDB7]'
                          : item.status === 'In-Progress'
                          ? 'bg-[#D9E5EE] text-[#1F4E79] border-[#B3C8D9]'
                          : 'bg-[#F4DCD3] text-[#A8432F] border-[#E2B5A6]'
                      }`}
                    >
                      <option value="Compliant">✓ Compliant</option>
                      <option value="In-Progress">⏳ In-Progress</option>
                      <option value="Action-Required">⚠ Action-Required</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Requirement Form */}
          <form onSubmit={handleAddItem} className="p-3 bg-[#EEF3EF] border border-[#D3DDD7] rounded-lg">
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] uppercase tracking-wider block mb-2 font-medium">
              Add Internal Remediation Action Item
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newRequirement}
                onChange={(e) => setNewRequirement(e.target.value)}
                placeholder="e.g. Schedule emergency external key custodian drill..."
                className="flex-1 bg-[#FBFCFA] border border-[#D3DDD7] px-3 py-1.5 rounded text-[12px] text-[#1D2630] focus:outline-none focus:border-[#1F4E79]"
              />
              <select
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                className="bg-[#FBFCFA] border border-[#D3DDD7] px-3 py-1.5 rounded text-[12px] text-[#1D2630] focus:outline-none"
              >
                <option value="Custody Operations">Custody Operations</option>
                <option value="Wealth Tech">Wealth Tech</option>
                <option value="CISO & InfoSec">CISO &amp; InfoSec</option>
                <option value="Legal & Regulatory">Legal &amp; Regulatory</option>
              </select>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-[#1F4E79] text-white text-[12px] font-semibold rounded hover:bg-[#163A5C] transition-colors shadow-xs"
              >
                Add Action
              </button>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#E3EBE6] border-t border-[#D3DDD7] flex items-center justify-between">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
            Syncs to Jira, ServiceNow, and GRC Enterprise Systems
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-[#FBFCFA] hover:bg-[#F4F7F4] border border-[#D3DDD7] text-[#3C4852] font-['Inter'] text-[12px] rounded transition-colors shadow-2xs"
            >
              Close
            </button>
            <button
              onClick={handleExportGapReport}
              className="px-4 py-1.5 bg-[#1F4E79] hover:bg-[#163A5C] text-white font-['Inter'] text-[12px] font-semibold rounded flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">
                download
              </span>
              <span>Export Checklist (CSV)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

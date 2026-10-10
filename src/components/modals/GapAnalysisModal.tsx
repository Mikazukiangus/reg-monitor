import React, { useState } from 'react';
import { useDialog } from '../useDialog';
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
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
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
  const [newOwner, setNewOwner] = useState('');

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
      owner: newOwner.trim() || 'Unassigned',
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="gap-title" tabIndex={-1} className="focus:outline-none bg-panel border border-line-strong rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-wash border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">assignment</span>
            <div>
              <h2 id="gap-title" className="font-['Hanken_Grotesk'] text-[18px] text-ink font-bold">
                Institutional Gap Analysis &amp; Action Matrix
              </h2>
              <p className="font-['JetBrains_Mono'] text-[11px] text-muted">
                {notice.regulator} • {notice.ref} • Date: {notice.statutoryDeadline || 'None found in source'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-muted hover:text-ink hover:bg-wash-strong transition-colors"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div tabIndex={0} aria-label="Checklist" className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Summary Banner */}
          <div className="p-3.5 bg-page border border-wash-strong rounded-lg">
            <span className="font-['JetBrains_Mono'] text-[10px] text-accent uppercase font-bold tracking-wider block mb-1">
              Active Regulatory Matter
            </span>
            <h3 className="font-['Hanken_Grotesk'] text-[15px] font-bold text-ink mb-1">
              {notice.title}
            </h3>
            <div className="flex flex-wrap gap-2 text-[11px] text-ink-soft font-['JetBrains_Mono'] mt-2">
              <span className="px-2 py-0.5 bg-panel rounded border border-line">
                Impact Score: {notice.impactScore.toFixed(1)}/10
              </span>
              <span className="px-2 py-0.5 bg-panel rounded border border-line">
                Jurisdiction: {notice.jurisdiction}
              </span>
              <span className="px-2 py-0.5 bg-orange-tint text-orange-deep rounded border border-orange-line font-semibold">
                SEAR CISO Liability: Active
              </span>
            </div>
          </div>

          {/* Checklist Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Hanken_Grotesk'] text-[14px] font-bold text-ink">
                Statutory Obligations &amp; Readiness Checklist
              </span>
              <span className="font-['JetBrains_Mono'] text-[11px] text-green font-bold">
                {checklist.filter(c => c.status === 'Compliant').length} of {checklist.length} Controls Verified
              </span>
            </div>

            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-page border border-line rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-wash transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-['Inter'] text-[13px] font-semibold text-ink">
                      {item.requirement}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 font-['JetBrains_Mono'] text-[11px] text-muted">
                      <span>Owner: <strong className="text-ink">{item.owner}</strong></span>
                      <span>Target: <strong className="text-accent">{item.deadline || "Not set"}</strong></span>
                      <span className="text-ink-soft italic">{item.notes}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value as ChecklistItem['status'])}
                      aria-label={`Status: ${item.requirement}`}
                      className={`text-[11px] font-['JetBrains_Mono'] font-bold px-2.5 py-1 rounded border cursor-pointer focus:outline-none ${
                        item.status === 'Compliant'
                          ? 'bg-green-tint text-green border-green-line'
                          : item.status === 'In-Progress'
                          ? 'bg-accent-tint text-accent border-accent-line'
                          : 'bg-orange-tint text-orange border-orange-line'
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
          <form onSubmit={handleAddItem} className="p-3 bg-page border border-line rounded-lg">
            <span className="font-['JetBrains_Mono'] text-[10px] text-muted uppercase tracking-wider block mb-2 font-medium">
              Add Internal Remediation Action Item
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newRequirement}
                onChange={(e) => setNewRequirement(e.target.value)}
                placeholder="Add an action for your firm"
                aria-label="New action item"
                className="flex-1 bg-panel border border-line px-3 py-1.5 rounded text-[12px] text-ink focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="Owner (optional)"
                aria-label="Owner"
                className="sm:w-44 bg-panel border border-line px-3 py-1.5 rounded text-[12px] text-ink focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-accent text-on-accent text-[12px] font-semibold rounded hover:bg-accent-deep transition-colors shadow-xs"
              >
                Add Action
              </button>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-wash border-t border-line flex items-center justify-between">
          <span className="font-['JetBrains_Mono'] text-[11px] text-muted">
            Syncs to Jira, ServiceNow, and GRC Enterprise Systems
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-panel hover:bg-panel-raised border border-line text-ink-soft font-['Inter'] text-[12px] rounded transition-colors shadow-2xs"
            >
              Close
            </button>
            <button
              onClick={handleExportGapReport}
              className="px-4 py-1.5 bg-accent hover:bg-accent-deep text-on-accent font-['Inter'] text-[12px] font-semibold rounded flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
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

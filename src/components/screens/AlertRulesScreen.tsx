import React, { useEffect, useState } from 'react';
import { CustomAlertRule, RegulatoryNotice } from '../../types/regulatory';
import { DEFAULT_RULES, ruleMatches } from '../../lib/alertRules';
import { copyText } from '../../lib/urlState';

// Rules made on this tab are kept in this browser only
const RULES_KEY = 'regsonar.alertRules';

function loadRules(): CustomAlertRule[] {
  try {
    const saved = localStorage.getItem(RULES_KEY);
    if (saved) {
      const rules = JSON.parse(saved);
      if (Array.isArray(rules)) return rules;
    }
  } catch {
    // Private windows and blocked storage: start from the default rules
  }
  return DEFAULT_RULES;
}

function saveRules(rules: CustomAlertRule[]) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    // Not saved; the rules still work until the tab is closed
  }
}

interface DigestInfo {
  rules: CustomAlertRule[];
  schedule: string;
  configured: boolean;
}

interface AlertRulesScreenProps {
  notices: RegulatoryNotice[];
}

export const AlertRulesScreen: React.FC<AlertRulesScreenProps> = ({ notices }) => {
  const [rules, setRulesState] = useState<CustomAlertRule[]>(loadRules);
  const setRules = (update: CustomAlertRule[] | ((prev: CustomAlertRule[]) => CustomAlertRule[])) => {
    setRulesState(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      saveRules(next);
      return next;
    });
  };
  const [agencies, setAgencies] = useState('MAS, HKMA');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [minImpact, setMinImpact] = useState(8.0);
  const [keywords, setKeywords] = useState('');
  const [digest, setDigest] = useState<DigestInfo | null>(null);
  const [digestError, setDigestError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/digest/rules')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(data => setDigest({ rules: data.rules, schedule: data.schedule, configured: data.configured }))
      .catch(() => setDigestError(true));
  }, []);

  const handleCopyRules = async () => {
    const ok = await copyText(JSON.stringify(rules.map(({ id, name, jurisdictions, minImpact, keywords, enabled }) => ({ id, name, jurisdictions, minImpact, keywords, enabled })), null, 2));
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  };

  const handleToggleRule = (id: string) => {
    setRules(prev =>
      prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleDeleteRule = (rule: CustomAlertRule) => {
    if (window.confirm(`Delete the rule "${rule.name}"?`)) setRules(prev => prev.filter(r => r.id !== rule.id));
  };

  const handleResetRules = () => {
    if (window.confirm('Replace your rules with the starting set?')) setRules(DEFAULT_RULES);
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const newRule: CustomAlertRule = {
      id: `rule-${Date.now()}`,
      name: ruleName,
      jurisdictions: agencies.split(',').map(a => a.trim()).filter(Boolean),
      minImpact: minImpact,
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      enabled: true
    };

    setRules([newRule, ...rules]);
    setRuleName('');
    setKeywords('');
    setShowCreateModal(false);
  };

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#1F4E79] text-2xl">tune</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1D2630]">
              Watch Rules
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-[#3C4852]">
            Rules here are checked against the notices currently loaded and are saved in this browser only. The daily email digest below uses its own rules, stored on the server.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-[#1F4E79] hover:bg-[#163A5C] text-white text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <span className="material-symbols-outlined text-base">add</span>
          <span>New Alert Rule</span>
        </button>
      </div>

      {/* Daily email digest (server side, to the site owner only) */}
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1F4E79] text-xl">mail</span>
            <h2 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1D2630]">Daily email digest</h2>
          </div>
          {digest && (
            <span
              className={`font-['JetBrains_Mono'] text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                digest.configured ? 'bg-[#D7E9DD] text-[#2F6249] border-[#ABCDB7]' : 'bg-[#F8F1DC] text-[#6E5410] border-[#DCC68A]'
              }`}
            >
              {digest.configured ? 'Sending is set up' : 'Not sending yet'}
            </span>
          )}
        </div>
        <p className="font-['Inter'] text-[13px] text-[#3C4852]">
          {digest ? `${digest.schedule}, ` : ''}one email to the site owner listing the previous day's notices (Singapore time) that match these rules, read from up to 20 recent items per source. No email is sent on days with no matches.
          {digest && !digest.configured && ' It starts once the CRON_SECRET, RESEND_API_KEY and DIGEST_TO settings are added to the Vercel project.'}
        </p>
        {digestError && <p className="font-['Inter'] text-[12px] text-[#A8432F]">The digest settings could not be loaded.</p>}
        {digest && (
          <ul className="flex flex-wrap gap-2">
            {digest.rules.filter(r => r.enabled).map(r => (
              <li key={r.id} className="font-['Inter'] text-[12px] bg-[#E3EBE6] text-[#1D2630] px-2.5 py-1 rounded-md" title={`${r.jurisdictions.join(', ') || 'Any regulator'} · impact ≥ ${r.minImpact} · ${r.keywords.join(', ') || 'any keywords'}`}>
                {r.name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyRules}
            className="px-3 py-1.5 border border-[#C5D2CA] hover:bg-[#E3EBE6] text-[#1D2630] text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-base">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied' : 'Copy the rules on this tab'}
          </button>
          <span className="font-['Inter'] text-[11px] text-[#56636B]">To use them for the digest, put them in digest-rules.ts in the project.</span>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="space-y-4">
        {rules.map((rule) => {
          const matches = rule.enabled ? notices.filter(n => ruleMatches(rule, n)) : [];
          return (
          <div
            key={rule.id}
            className="p-5 bg-[#FBFCFA] border border-[#D3DDD7] rounded-xl hover:bg-[#F4F7F4] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
          >
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1D2630]">
                  {rule.name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border ${
                    rule.enabled
                      ? 'bg-[#D7E9DD] text-[#2F6249] border-[#ABCDB7]'
                      : 'bg-[#E3EBE6] text-[#56636B] border-[#D3DDD7]'
                  }`}
                >
                  {rule.enabled ? 'ACTIVE' : 'PAUSED'}
                </span>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
                  Min Impact: ≥ {rule.minImpact}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-['JetBrains_Mono'] text-[#56636B]">Agencies:</span>
                {rule.jurisdictions.map(j => (
                  <span key={j} className="px-2 py-0.5 bg-[#EEF3EF] text-[#1F4E79] border border-[#D3DDD7] rounded text-[10px] font-['JetBrains_Mono'] font-bold">
                    {j}
                  </span>
                ))}

                <span className="text-[11px] font-['JetBrains_Mono'] text-[#56636B] ml-2">Keywords:</span>
                {rule.keywords.map(k => (
                  <span key={k} className="px-2 py-0.5 bg-[#EEF3EF] text-[#3C4852] border border-[#D3DDD7] rounded text-[10px] font-['JetBrains_Mono'] font-medium">
                    {k}
                  </span>
                ))}
              </div>

              <div className="text-[11px] font-['JetBrains_Mono'] text-[#56636B]">
                {rule.enabled ? (
                  <>
                    <span>
                      Matching notices: <strong className="text-[#1F4E79]">{matches.length}</strong>
                    </span>
                    {matches.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 font-['Inter'] text-[12px] text-[#3C4852]">
                        {matches.slice(0, 5).map(n => (
                          <li key={n.id} className="truncate">
                            <span className="font-['JetBrains_Mono'] text-[11px] text-[#1F4E79] mr-1.5">{n.regulator}</span>
                            {n.dossierUrl ? (
                              <a href={n.dossierUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#1F4E79] hover:underline">
                                {n.title}
                              </a>
                            ) : (
                              n.title
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <span>Paused</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => handleToggleRule(rule.id)}
                className={`px-3 py-1.5 rounded text-[11px] font-['JetBrains_Mono'] font-bold border transition-colors shadow-2xs ${
                  rule.enabled
                    ? 'border-[#ECC6B9] bg-[#F8E8E2] text-[#A8432F] hover:bg-[#F4DCD3]'
                    : 'border-[#C3DECB] bg-[#EAF3ED] text-[#2F6249] hover:bg-[#D7E9DD]'
                }`}
              >
                {rule.enabled ? 'Pause Rule' : 'Resume Rule'}
              </button>
              <button
                onClick={() => handleDeleteRule(rule)}
                className="w-9 h-9 flex items-center justify-center rounded text-[#56636B] hover:text-[#A8432F] hover:bg-[#F8E8E2] transition-colors"
                aria-label={`Delete the rule ${rule.name}`}
                title="Delete rule"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
              </button>
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button onClick={handleResetRules} className="font-['Inter'] text-[12px] text-[#56636B] hover:text-[#1F4E79] hover:underline">
          Reset to the starting rules
        </button>
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-[#FBFCFA] border border-[#C5D2CA] rounded-xl w-full max-w-lg shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#D3DDD7]">
              <h3 className="font-['Hanken_Grotesk'] text-[17px] font-bold text-[#1D2630]">
                Create Watch Rule
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[#56636B] hover:text-[#1D2630]">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3 font-['Inter'] text-[12px]">
              <div>
                <label className="block text-[#56636B] font-['JetBrains_Mono'] mb-1 font-medium">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Stablecoin rules"
                  className="w-full bg-[#FBFCFA] border border-[#D3DDD7] px-3 py-1.5 rounded text-[#1D2630] focus:outline-none focus:border-[#1F4E79]"
                  required
                />
              </div>

              <div>
                <label className="block text-[#56636B] font-['JetBrains_Mono'] mb-1 font-medium">
                  Regulators (comma separated)
                </label>
                <input
                  type="text"
                  value={agencies}
                  onChange={(e) => setAgencies(e.target.value)}
                  placeholder="e.g. MAS, HKMA, SEC, PRA, BIS"
                  className="w-full bg-[#FBFCFA] border border-[#D3DDD7] px-3 py-1.5 rounded text-[#1D2630] focus:outline-none focus:border-[#1F4E79]"
                />
              </div>

              <div>
                <label className="block text-[#56636B] font-['JetBrains_Mono'] mb-1 font-medium">
                  Minimum Impact Threshold: {minImpact} / 10
                </label>
                <input
                  type="range"
                  min="0"
                  max="10.0"
                  step="0.1"
                  value={minImpact}
                  onChange={(e) => setMinImpact(parseFloat(e.target.value))}
                  className="w-full accent-[#1F4E79]"
                />
              </div>

              <div>
                <label className="block text-[#56636B] font-['JetBrains_Mono'] mb-1 font-medium">
                  Trigger Keywords (comma separated)
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. custody, stablecoin, climate"
                  className="w-full bg-[#FBFCFA] border border-[#D3DDD7] px-3 py-1.5 rounded text-[#1D2630] focus:outline-none focus:border-[#1F4E79]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 text-[#3C4852] hover:text-[#1D2630] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#1F4E79] text-white font-semibold rounded hover:bg-[#163A5C] shadow-xs"
                >
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

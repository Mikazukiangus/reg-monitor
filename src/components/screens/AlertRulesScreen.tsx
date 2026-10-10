import React, { useEffect, useState } from 'react';
import { useDialog } from '../useDialog';
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
  const createDialogRef = useDialog<HTMLDivElement>(showCreateModal, () => setShowCreateModal(false));
  const [ruleName, setRuleName] = useState('');
  const [minImpact, setMinImpact] = useState(7);
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
      <div className="bg-panel border border-line rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">tune</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-ink">
              Watch Rules
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-ink-soft">
            Rules here are checked against the notices currently loaded and are saved in this browser only. The daily email digest below uses its own rules, stored on the server.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-deep text-on-accent text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">add</span>
          <span>New Alert Rule</span>
        </button>
      </div>

      {/* Daily email digest (server side, to the site owner only) */}
      <div className="bg-panel border border-line rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-xl" aria-hidden="true">mail</span>
            <h2 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink break-words">Daily email digest</h2>
          </div>
          {digest && (
            <span
              className={`font-['JetBrains_Mono'] text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                digest.configured ? 'bg-green-tint text-green border-green-line' : 'bg-cream-wash text-cream border-cream-line'
              }`}
            >
              {digest.configured ? 'Sending is set up' : 'Not sending yet'}
            </span>
          )}
        </div>
        <p className="font-['Inter'] text-[13px] text-ink-soft">
          {digest ? `${digest.schedule}, ` : ''}one email to the site owner listing the previous day's notices (Singapore time) that match these rules, read from up to 20 recent items per source. No email is sent on days with no matches.
          {digest && !digest.configured && ' It starts once the CRON_SECRET, RESEND_API_KEY and DIGEST_TO settings are added to the Vercel project.'}
        </p>
        {digestError && <p className="font-['Inter'] text-[12px] text-orange">The digest settings could not be loaded.</p>}
        {digest && (
          <ul className="flex flex-wrap gap-2">
            {digest.rules.filter(r => r.enabled).map(r => (
              <li key={r.id} className="font-['Inter'] text-[12px] bg-wash text-ink px-2.5 py-1 rounded-md" title={`${r.jurisdictions.join(', ') || 'Any regulator'} · impact ≥ ${r.minImpact} · ${r.keywords.join(', ') || 'any keywords'}`}>
                {r.name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyRules}
            className="px-3 py-1.5 border border-line-strong hover:bg-wash text-ink text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied' : 'Copy the rules on this tab'}
          </button>
          <span className="font-['Inter'] text-[11px] text-muted">To use them for the digest, put them in digest-rules.ts in the project.</span>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="space-y-4">
        {rules.map((rule) => {
          const matches = rule.enabled ? notices.filter(n => ruleMatches(rule, n)) : [];
          return (
          <div
            key={rule.id}
            className="p-5 bg-panel border border-line rounded-xl hover:bg-panel-raised transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
          >
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink break-words">
                  {rule.name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border ${
                    rule.enabled
                      ? 'bg-green-tint text-green border-green-line'
                      : 'bg-wash text-muted border-line'
                  }`}
                >
                  {rule.enabled ? 'ACTIVE' : 'PAUSED'}
                </span>
                <span className="font-['JetBrains_Mono'] text-[11px] text-muted">
                  Min Impact: ≥ {rule.minImpact}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-['JetBrains_Mono'] text-muted">Agencies:</span>
                {rule.jurisdictions.map(j => (
                  <span key={j} className="px-2 py-0.5 bg-page text-accent border border-line rounded text-[10px] font-['JetBrains_Mono'] font-bold">
                    {j}
                  </span>
                ))}

                <span className="text-[11px] font-['JetBrains_Mono'] text-muted ml-2">Keywords:</span>
                {rule.keywords.map(k => (
                  <span key={k} className="px-2 py-0.5 bg-page text-ink-soft border border-line rounded text-[10px] font-['JetBrains_Mono'] font-medium break-all">
                    {k}
                  </span>
                ))}
              </div>

              <div className="text-[11px] font-['JetBrains_Mono'] text-muted">
                {rule.enabled ? (
                  <>
                    <span>
                      Matching notices: <strong className="text-accent">{matches.length}</strong>
                    </span>
                    {matches.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 font-['Inter'] text-[12px] text-ink-soft">
                        {matches.slice(0, 5).map(n => (
                          <li key={n.id} className="truncate">
                            <span className="font-['JetBrains_Mono'] text-[11px] text-accent mr-1.5">{n.regulator}</span>
                            {n.dossierUrl ? (
                              <a href={n.dossierUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
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

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={() => handleToggleRule(rule.id)}
                className={`px-3 py-1.5 rounded text-[11px] font-['JetBrains_Mono'] font-bold border transition-colors shadow-2xs ${
                  rule.enabled
                    ? 'border-orange-line-soft bg-orange-wash text-orange hover:bg-orange-tint'
                    : 'border-green-line-soft bg-green-wash text-green hover:bg-green-tint'
                }`}
              >
                {rule.enabled ? 'Pause Rule' : 'Resume Rule'}
              </button>
              <button
                onClick={() => handleDeleteRule(rule)}
                className="w-9 h-9 flex items-center justify-center rounded text-muted hover:text-orange hover:bg-orange-wash transition-colors"
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
        <button onClick={handleResetRules} className="font-['Inter'] text-[12px] text-muted hover:text-accent hover:underline">
          Reset to the starting rules
        </button>
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div ref={createDialogRef} role="dialog" aria-modal="true" aria-labelledby="create-rule-title" tabIndex={-1} className="bg-panel border border-line-strong rounded-xl w-full max-w-lg shadow-2xl p-5 space-y-4 focus:outline-none">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 id="create-rule-title" className="font-['Hanken_Grotesk'] text-[17px] font-bold text-ink">
                Create Watch Rule
              </h3>
              <button onClick={() => setShowCreateModal(false)} aria-label="Close" className="text-muted hover:text-ink">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3 font-['Inter'] text-[12px]">
              <div>
                <label htmlFor="rule-name" className="block text-muted font-['JetBrains_Mono'] mb-1 font-medium">Rule Name</label>
                <input
                  id="rule-name"
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Stablecoin rules"
                  className="w-full bg-panel border border-line px-3 py-1.5 rounded text-ink focus:outline-none focus:border-accent"
                  required
                />
              </div>

              <div>
                <label htmlFor="rule-agencies" className="block text-muted font-['JetBrains_Mono'] mb-1 font-medium">
                  Regulators (comma separated)
                </label>
                <input
                  id="rule-agencies"
                  type="text"
                  value={agencies}
                  onChange={(e) => setAgencies(e.target.value)}
                  placeholder="e.g. MAS, HKMA, SEC, PRA, BIS"
                  className="w-full bg-panel border border-line px-3 py-1.5 rounded text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor="rule-impact" className="block text-muted font-['JetBrains_Mono'] mb-1 font-medium">
                  Minimum Impact Threshold: {minImpact} / 10
                </label>
                <input
                  id="rule-impact"
                  type="range"
                  min="0"
                  max="10.0"
                  step="0.5"
                  value={minImpact}
                  aria-describedby="rule-impact-help"
                  onChange={(e) => setMinImpact(parseFloat(e.target.value))}
                  className="w-full accent-accent"
                />
                <p id="rule-impact-help" className="font-['Inter'] text-[11px] text-muted mt-1">
                  3 routine releases · 4 SEC filings by exchanges · 5 announcements · 6.5 guidance · 7 enforcement and open consultations · 7.5 rules made · +1.5 when a closing or effective date is near
                </p>
              </div>

              <div>
                <label htmlFor="rule-keywords" className="block text-muted font-['JetBrains_Mono'] mb-1 font-medium">
                  Trigger Keywords (comma separated)
                </label>
                <input
                  id="rule-keywords"
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. custody, stablecoin, climate"
                  className="w-full bg-panel border border-line px-3 py-1.5 rounded text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 text-ink-soft hover:text-ink font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-accent text-on-accent font-semibold rounded hover:bg-accent-deep shadow-xs"
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

import React, { useState } from 'react';
import { useDialog } from '../useDialog';

export interface EndpointMetric {
  id: string;
  name: string;
  agency: string;
  jurisdiction: string;
  url: string;
  protocol: string;
  auth: string;
  status: EndpointStatus;
  statusCode?: number | null;
  pingMs: number | null;
  detail?: string;
  ingests?: boolean;
  // Result of the most recent notice sync for sources read from this endpoint
  // lastSuccessAt: when the oldest of its sources last fetched successfully
  sync?: { ok: boolean; count: number; error?: string; lastSuccessAt?: string | null };
}

export type EndpointStatus = 'Operational' | 'Degraded' | 'Down' | 'Checking';

export const STATUS_STYLES: Record<EndpointStatus, { badge: string; text: string; dot: string }> = {
  Operational: { badge: 'bg-green-tint text-green border-green-line', text: 'text-green', dot: 'bg-green-dot' },
  Degraded: { badge: 'bg-cream-tint text-cream border-cream-line', text: 'text-cream', dot: 'bg-cream' },
  Down: { badge: 'bg-orange-wash text-orange border-orange-line', text: 'text-orange', dot: 'bg-orange' },
  Checking: { badge: 'bg-wash text-muted border-line', text: 'text-muted', dot: 'bg-muted' }
};

interface LiveEndpointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  endpoints: EndpointMetric[];
  onPingAll: () => Promise<void>;
  onSyncAll: () => Promise<void>;
  isSyncing: boolean;
  isPinging: boolean;
  lastSyncTime: string;
  autoSyncInterval: number; // in seconds
  onChangeAutoSyncInterval: (secs: number) => void;
}

export const LiveEndpointsModal: React.FC<LiveEndpointsModalProps> = ({
  isOpen,
  onClose,
  endpoints,
  onPingAll,
  onSyncAll,
  isSyncing,
  isPinging,
  lastSyncTime,
  autoSyncInterval,
  onChangeAutoSyncInterval
}) => {
  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<'endpoints' | 'architecture'>('endpoints');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const operationalCount = endpoints.filter(e => e.status === 'Operational').length;
  const responded = endpoints.filter(e => e.pingMs !== null);
  const avgPing = responded.length
    ? Math.round(responded.reduce((acc, e) => acc + (e.pingMs ?? 0), 0) / responded.length)
    : null;
  const headerTone = operationalCount === endpoints.length ? STATUS_STYLES.Operational : STATUS_STYLES.Degraded;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="endpoints-title" tabIndex={-1} className="focus:outline-none bg-panel border border-line-strong rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-wash border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-tint border border-accent-line text-accent flex items-center justify-center">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">cloud_sync</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="endpoints-title" className="font-['Hanken_Grotesk'] text-[17px] font-bold text-ink">
                  Automated Feeds &amp; Live API Gateway
                </h3>
                <span className={`font-['JetBrains_Mono'] text-[10px] font-bold border px-2 py-0.5 rounded-full flex items-center gap-1 ${headerTone.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${headerTone.dot}`}></span>
                  {operationalCount}/{endpoints.length} Operational
                </span>
              </div>
              <p className="font-['Inter'] text-[11px] text-muted">
                Notices ingested from US Federal Register, FINRA, UK PRA and FCA, ESMA, HKMA, SFC, HKEX, MAS, SGX RegCo, BNM, SC Malaysia, ASIC, ASX, JFSA, JPX, BIS and FSB, and on AI rules from the European Commission, UK DSIT and AI Security Institute, US federal agencies, the FTC, California, Colorado, Korea’s MSIT, China’s State Council policy library and Japan’s Cabinet Office, and on data privacy from the UK ICO, the EDPB, Singapore’s PDPC, Malaysia’s JPDP, Australia’s OAIC, Japan’s PPC, Korea’s PIPC, China’s State Council policy library, the FTC and CalPrivacy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
            aria-label="Close"
              className="p-1.5 text-muted hover:text-ink rounded-lg hover:bg-wash-strong transition-colors"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        {/* Top Control Bar */}
        <div className="px-5 py-3 bg-panel-raised border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[12px]">
            <div>
              <span className="text-muted font-medium mr-1.5">Last Sync:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-ink">
                {lastSyncTime || 'Just now'}
              </span>
            </div>
            <div className="h-3 w-px bg-line-strong"></div>
            <div>
              <span className="text-muted font-medium mr-1.5">Average Latency:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-accent">
                {avgPing !== null ? `${avgPing}ms` : 'n/a'}
              </span>
            </div>
            <div className="h-3 w-px bg-line-strong"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted font-medium">Auto-Sync:</span>
              <select
                value={autoSyncInterval}
                onChange={(e) => onChangeAutoSyncInterval(Number(e.target.value))}
                aria-label="Auto-sync interval"
                className="bg-panel border border-line text-ink font-['JetBrains_Mono'] text-[11px] rounded px-2 py-0.5 focus:outline-none focus:border-accent"
              >
                <option value={60}>Every 1 min</option>
                <option value={180}>Every 3 mins</option>
                <option value={300}>Every 5 mins</option>
                <option value={900}>Every 15 mins</option>
                <option value={0}>Manual Only</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPingAll}
              disabled={isPinging}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-panel hover:bg-wash border border-line text-ink font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-2xs disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm text-accent ${isPinging ? 'animate-spin' : ''}`} aria-hidden="true">
                network_check
              </span>
              <span>{isPinging ? 'Pinging...' : 'Ping Endpoints'}</span>
            </button>

            <button
              onClick={onSyncAll}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-deep text-on-accent font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true">
                sync
              </span>
              <span>{isSyncing ? 'Ingesting Feeds...' : 'Sync Live Feeds'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-2 border-b border-line flex gap-4 bg-panel">
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`pb-2 text-[12px] font-semibold border-b-2 transition-colors ${
              activeTab === 'endpoints'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Connected Endpoints ({endpoints.length})
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2 text-[12px] font-semibold border-b-2 transition-colors ${
              activeTab === 'architecture'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Ingestion Pipeline &amp; Key Points
          </button>
        </div>

        {/* Content Body */}
        <div tabIndex={0} aria-label="Source details" className="p-5 overflow-y-auto max-h-[calc(90vh-210px)] space-y-4">
          {activeTab === 'endpoints' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="bg-panel-raised border border-wash-strong rounded-lg p-3.5 flex flex-col justify-between hover:border-line-strong transition-colors shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-['Hanken_Grotesk'] text-[14px] font-bold text-ink">
                            {ep.name}
                          </span>
                        </div>
                        <span className="font-['JetBrains_Mono'] text-[10px] text-muted uppercase tracking-wider block">
                          {ep.agency} • {ep.jurisdiction}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`font-['JetBrains_Mono'] text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_STYLES[ep.status].badge}`}
                          title={ep.detail}
                        >
                          {ep.status}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-[11px] mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Protocol:</span>
                        <span className="font-['JetBrains_Mono'] text-ink font-semibold bg-panel px-1.5 py-0.5 rounded border border-line">
                          {ep.protocol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Authentication:</span>
                        <span className="font-['Inter'] text-ink font-medium">
                          {ep.auth}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Round-Trip Ping:</span>
                        <span className="font-['JetBrains_Mono'] font-bold text-accent">
                          {ep.status === 'Checking' ? 'Testing...' : ep.pingMs !== null ? `${ep.pingMs} ms` : 'No response'}
                        </span>
                      </div>
                      {ep.detail && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted shrink-0">Last Check:</span>
                          <span className={`font-['JetBrains_Mono'] text-right ${STATUS_STYLES[ep.status].text}`}>
                            {ep.detail}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted shrink-0">Notice Ingestion:</span>
                        <span className="font-['JetBrains_Mono'] text-right text-ink">
                          {!ep.ingests
                            ? 'Status check only'
                            : !ep.sync
                              ? 'Not synced yet'
                              : ep.sync.ok
                                ? `${ep.sync.count} notices last sync`
                                : `Failed: ${ep.sync.error}${ep.sync.count ? ` (showing ${ep.sync.count} cached)` : ''}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line flex items-center justify-between">
                    <span className="font-['JetBrains_Mono'] text-[10px] text-muted truncate max-w-[260px]">
                      {ep.url}
                    </span>
                    <button
                      onClick={() => handleCopy(ep.url)}
                      className="text-muted hover:text-accent transition-colors p-1 rounded"
                      title="Copy URL endpoint"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        {copiedUrl === ep.url ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-panel-raised border border-wash-strong rounded-lg p-4">
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold text-ink mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-accent text-lg" aria-hidden="true">schema</span>
                  <span>Automated Continuous Ingestion Loop</span>
                </h4>
                <p className="font-['Inter'] text-[12px] text-ink-soft leading-relaxed mb-3">
                  {autoSyncInterval ? `While this page is open, it asks the server for the latest notices every ${autoSyncInterval / 60} ${autoSyncInterval === 60 ? 'minute' : 'minutes'}.` : 'Auto-sync is off: the page asks the server for notices only when you press Sync.'} The server fetches each official source at most once every 10 minutes to respect government rate limits, and a scheduled check reads every source seven times a day even when no one has the page open. Failed sources keep their last good results and report the error.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                  <div className="p-3 bg-panel border border-line rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-accent block mb-1">
                      1. Ingestion Layer
                    </span>
                    <span className="text-ink-soft">
                      Reads {endpoints.length} official sources: JSON APIs, RSS feeds and public web pages, listed above with their protocol and status. The FCA feed is behind a Cloudflare bot check and is sometimes blocked.
                    </span>
                  </div>

                  <div className="p-3 bg-panel border border-line rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-accent block mb-1">
                      2. Classification
                    </span>
                    <span className="text-ink-soft">
                      Keyword rules assign sector and instrument format. Impact scores follow a fixed rubric of what the document does and the dates it states, not an AI assessment.
                    </span>
                  </div>

                  <div className="p-3 bg-panel border border-line rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-accent block mb-1">
                      3. Refresh in the Browser
                    </span>
                    <span className="text-ink-soft">
                      Each sync replaces the feed with the latest notices from every source and recomputes the KPI ribbon, filters and deadlines.
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-panel border border-line rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-['Hanken_Grotesk'] text-[13px] font-bold text-ink">
                    Key Points (extractive)
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] font-bold bg-accent-tint text-accent border border-accent-line px-2 py-0.5 rounded">
                    TextRank • OCR for scanned PDFs • No external API
                  </span>
                </div>
                <p className="font-['Inter'] text-[12px] text-muted leading-relaxed">
                  The server fetches each source document, extracts the article text (or the text layer of a PDF, for HKMA circulars and consultations) and ranks its sentences with TextRank. Scanned PDFs are first read with Tesseract OCR on the server; those key points are labelled OCR because recognition can misread characters. The top sentences are shown word for word, so every key point can be checked against the source. Dated sentences are picked out by rule, and only future dates are kept. A notice's date comes from a sentence that states it for the document itself and is labelled by kind: comments close, takes effect or comply by.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-wash border-t border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${headerTone.dot}`}></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-ink-soft">
              {operationalCount} of {endpoints.length} monitored endpoints operational
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-panel hover:bg-panel-raised border border-line-strong text-ink text-[12px] font-semibold rounded-lg transition-colors shadow-2xs"
          >
            Close Gateway
          </button>
        </div>
      </div>
    </div>
  );
};

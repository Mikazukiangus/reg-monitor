import React, { useState } from 'react';

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
  sync?: { ok: boolean; count: number; error?: string };
}

export type EndpointStatus = 'Operational' | 'Degraded' | 'Down' | 'Checking';

export const STATUS_STYLES: Record<EndpointStatus, { badge: string; text: string; dot: string }> = {
  Operational: { badge: 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]', text: 'text-[#15803D]', dot: 'bg-[#15803D]' },
  Degraded: { badge: 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]', text: 'text-[#B45309]', dot: 'bg-[#B45309]' },
  Down: { badge: 'bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]', text: 'text-[#DC2626]', dot: 'bg-[#DC2626]' },
  Checking: { badge: 'bg-[#F5F1E8] text-[#857F74] border-[#E5DFD5]', text: 'text-[#857F74]', dot: 'bg-[#857F74]' }
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
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E6F4F4] border border-[#B2DFDB] text-[#0D5C63] flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">cloud_sync</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-['Hanken_Grotesk'] text-[17px] font-bold text-[#1E1B18]">
                  Automated Feeds &amp; Live API Gateway
                </h3>
                <span className={`font-['JetBrains_Mono'] text-[10px] font-bold border px-2 py-0.5 rounded-full flex items-center gap-1 ${headerTone.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${headerTone.dot}`}></span>
                  {operationalCount}/{endpoints.length} Operational
                </span>
              </div>
              <p className="font-['Inter'] text-[11px] text-[#857F74]">
                Notices ingested from US Federal Register, HKMA, MAS and BIS. UK FCA attempted; ASIC status only.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-[#857F74] hover:text-[#1E1B18] rounded-lg hover:bg-[#EAE4D7] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Top Control Bar */}
        <div className="px-5 py-3 bg-[#FAF8F5] border-b border-[#E5DFD5] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[12px]">
            <div>
              <span className="text-[#857F74] font-medium mr-1.5">Last Sync:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-[#1E1B18]">
                {lastSyncTime || 'Just now'}
              </span>
            </div>
            <div className="h-3 w-px bg-[#D8D0C2]"></div>
            <div>
              <span className="text-[#857F74] font-medium mr-1.5">Average Latency:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-[#0D5C63]">
                {avgPing !== null ? `${avgPing}ms` : 'n/a'}
              </span>
            </div>
            <div className="h-3 w-px bg-[#D8D0C2]"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#857F74] font-medium">Auto-Sync:</span>
              <select
                value={autoSyncInterval}
                onChange={(e) => onChangeAutoSyncInterval(Number(e.target.value))}
                className="bg-[#FFFFFF] border border-[#E5DFD5] text-[#1E1B18] font-['JetBrains_Mono'] text-[11px] rounded px-2 py-0.5 focus:outline-none focus:border-[#0D5C63]"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-2xs disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm text-[#0D5C63] ${isPinging ? 'animate-spin' : ''}`}>
                network_check
              </span>
              <span>{isPinging ? 'Pinging...' : 'Ping Endpoints'}</span>
            </button>

            <button
              onClick={onSyncAll}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D5C63] hover:bg-[#0A474D] text-white font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{isSyncing ? 'Ingesting Feeds...' : 'Sync Live Feeds'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-2 border-b border-[#E5DFD5] flex gap-4 bg-[#FFFFFF]">
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`pb-2 text-[12px] font-semibold border-b-2 transition-colors ${
              activeTab === 'endpoints'
                ? 'border-[#0D5C63] text-[#0D5C63]'
                : 'border-transparent text-[#857F74] hover:text-[#1E1B18]'
            }`}
          >
            Connected Endpoints ({endpoints.length})
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2 text-[12px] font-semibold border-b-2 transition-colors ${
              activeTab === 'architecture'
                ? 'border-[#0D5C63] text-[#0D5C63]'
                : 'border-transparent text-[#857F74] hover:text-[#1E1B18]'
            }`}
          >
            Ingestion Pipeline &amp; AI Synthesis
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-210px)] space-y-4">
          {activeTab === 'endpoints' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="bg-[#FAF8F5] border border-[#EAE4D7] rounded-lg p-3.5 flex flex-col justify-between hover:border-[#D8D0C2] transition-colors shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1E1B18]">
                            {ep.name}
                          </span>
                        </div>
                        <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase tracking-wider block">
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
                        <span className="text-[#857F74]">Protocol:</span>
                        <span className="font-['JetBrains_Mono'] text-[#1E1B18] font-semibold bg-[#FFFFFF] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                          {ep.protocol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#857F74]">Authentication:</span>
                        <span className="font-['Inter'] text-[#1E1B18] font-medium">
                          {ep.auth}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#857F74]">Round-Trip Ping:</span>
                        <span className="font-['JetBrains_Mono'] font-bold text-[#0D5C63]">
                          {ep.status === 'Checking' ? 'Testing...' : ep.pingMs !== null ? `${ep.pingMs} ms` : 'No response'}
                        </span>
                      </div>
                      {ep.detail && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#857F74] shrink-0">Last Check:</span>
                          <span className={`font-['JetBrains_Mono'] text-right ${STATUS_STYLES[ep.status].text}`}>
                            {ep.detail}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#857F74] shrink-0">Notice Ingestion:</span>
                        <span className="font-['JetBrains_Mono'] text-right text-[#1E1B18]">
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

                  <div className="pt-2 border-t border-[#E5DFD5] flex items-center justify-between">
                    <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] truncate max-w-[260px]">
                      {ep.url}
                    </span>
                    <button
                      onClick={() => handleCopy(ep.url)}
                      className="text-[#857F74] hover:text-[#0D5C63] transition-colors p-1 rounded"
                      title="Copy URL endpoint"
                    >
                      <span className="material-symbols-outlined text-sm">
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
              <div className="bg-[#FAF8F5] border border-[#EAE4D7] rounded-lg p-4">
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1E1B18] mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#0D5C63] text-lg">schema</span>
                  <span>Automated Continuous Ingestion Loop</span>
                </h4>
                <p className="font-['Inter'] text-[12px] text-[#57534E] leading-relaxed mb-3">
                  The RegSonar Sentinel server worker queries official public government endpoints every {autoSyncInterval ? `${autoSyncInterval / 60} minutes` : 'configured cycle'}. Each source is fetched at most once every 10 minutes to respect government rate limits; failed sources keep their last good results and report the error.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                  <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-[#0D5C63] block mb-1">
                      1. Ingestion Layer
                    </span>
                    <span className="text-[#57534E]">
                      Fetches JSON from the US Federal Register, HKMA Open API and MAS news search, and RSS from BIS. The UK FCA feed is behind a Cloudflare bot check and is usually blocked.
                    </span>
                  </div>

                  <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-[#0D5C63] block mb-1">
                      2. Classification
                    </span>
                    <span className="text-[#57534E]">
                      Keyword rules assign sector and instrument format. Impact scores are a heuristic by document type, not an AI assessment.
                    </span>
                  </div>

                  <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-[#0D5C63] block mb-1">
                      3. Live Client Push
                    </span>
                    <span className="text-[#57534E]">
                      Adds new notices to the feed (deduplicated by source ID) and updates the KPI ribbon.
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-['Hanken_Grotesk'] text-[13px] font-bold text-[#1E1B18]">
                    AI Synthesis (not yet wired in)
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] font-bold bg-[#E6F4F4] text-[#0D5C63] border border-[#B2DFDB] px-2 py-0.5 rounded">
                    gemini-3.8-flash • Server-Side API
                  </span>
                </div>
                <p className="font-['Inter'] text-[12px] text-[#857F74] leading-relaxed">
                  The server exposes POST /api/feeds/synthesize, which calls Gemini when GEMINI_API_KEY is set and returns generic placeholder text otherwise. Live notices do not call it yet; they show the source's own abstract.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${headerTone.dot}`}></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#57534E]">
              {operationalCount} of {endpoints.length} monitored endpoints operational
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D8D0C2] text-[#1E1B18] text-[12px] font-semibold rounded-lg transition-colors shadow-2xs"
          >
            Close Gateway
          </button>
        </div>
      </div>
    </div>
  );
};

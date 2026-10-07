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
  // lastSuccessAt: when the oldest of its sources last fetched successfully
  sync?: { ok: boolean; count: number; error?: string; lastSuccessAt?: string | null };
}

export type EndpointStatus = 'Operational' | 'Degraded' | 'Down' | 'Checking';

export const STATUS_STYLES: Record<EndpointStatus, { badge: string; text: string; dot: string }> = {
  Operational: { badge: 'bg-[#D7E9DD] text-[#2F6249] border-[#ABCDB7]', text: 'text-[#2F6249]', dot: 'bg-[#2F6249]' },
  Degraded: { badge: 'bg-[#F3E8C6] text-[#6E5410] border-[#DCC68A]', text: 'text-[#6E5410]', dot: 'bg-[#6E5410]' },
  Down: { badge: 'bg-[#F8E8E2] text-[#A8432F] border-[#E2B5A6]', text: 'text-[#A8432F]', dot: 'bg-[#A8432F]' },
  Checking: { badge: 'bg-[#E3EBE6] text-[#56636B] border-[#D3DDD7]', text: 'text-[#56636B]', dot: 'bg-[#56636B]' }
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
      <div className="bg-[#FBFCFA] border border-[#C5D2CA] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-[#E3EBE6] border-b border-[#D3DDD7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D9E5EE] border border-[#B3C8D9] text-[#1F4E79] flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">cloud_sync</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-['Hanken_Grotesk'] text-[17px] font-bold text-[#1D2630]">
                  Automated Feeds &amp; Live API Gateway
                </h3>
                <span className={`font-['JetBrains_Mono'] text-[10px] font-bold border px-2 py-0.5 rounded-full flex items-center gap-1 ${headerTone.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${headerTone.dot}`}></span>
                  {operationalCount}/{endpoints.length} Operational
                </span>
              </div>
              <p className="font-['Inter'] text-[11px] text-[#56636B]">
                Notices ingested from US Federal Register, UK PRA, HKMA, MAS and BIS. UK FCA attempted; ASIC status only.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-[#56636B] hover:text-[#1D2630] rounded-lg hover:bg-[#DCE4DF] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Top Control Bar */}
        <div className="px-5 py-3 bg-[#F4F7F4] border-b border-[#D3DDD7] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[12px]">
            <div>
              <span className="text-[#56636B] font-medium mr-1.5">Last Sync:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-[#1D2630]">
                {lastSyncTime || 'Just now'}
              </span>
            </div>
            <div className="h-3 w-px bg-[#C5D2CA]"></div>
            <div>
              <span className="text-[#56636B] font-medium mr-1.5">Average Latency:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-[#1F4E79]">
                {avgPing !== null ? `${avgPing}ms` : 'n/a'}
              </span>
            </div>
            <div className="h-3 w-px bg-[#C5D2CA]"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#56636B] font-medium">Auto-Sync:</span>
              <select
                value={autoSyncInterval}
                onChange={(e) => onChangeAutoSyncInterval(Number(e.target.value))}
                className="bg-[#FBFCFA] border border-[#D3DDD7] text-[#1D2630] font-['JetBrains_Mono'] text-[11px] rounded px-2 py-0.5 focus:outline-none focus:border-[#1F4E79]"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FBFCFA] hover:bg-[#E3EBE6] border border-[#D3DDD7] text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-2xs disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm text-[#1F4E79] ${isPinging ? 'animate-spin' : ''}`}>
                network_check
              </span>
              <span>{isPinging ? 'Pinging...' : 'Ping Endpoints'}</span>
            </button>

            <button
              onClick={onSyncAll}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F4E79] hover:bg-[#163A5C] text-white font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{isSyncing ? 'Ingesting Feeds...' : 'Sync Live Feeds'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-2 border-b border-[#D3DDD7] flex gap-4 bg-[#FBFCFA]">
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`pb-2 text-[12px] font-semibold border-b-2 transition-colors ${
              activeTab === 'endpoints'
                ? 'border-[#1F4E79] text-[#1F4E79]'
                : 'border-transparent text-[#56636B] hover:text-[#1D2630]'
            }`}
          >
            Connected Endpoints ({endpoints.length})
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2 text-[12px] font-semibold border-b-2 transition-colors ${
              activeTab === 'architecture'
                ? 'border-[#1F4E79] text-[#1F4E79]'
                : 'border-transparent text-[#56636B] hover:text-[#1D2630]'
            }`}
          >
            Ingestion Pipeline &amp; Key Points
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-210px)] space-y-4">
          {activeTab === 'endpoints' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="bg-[#F4F7F4] border border-[#DCE4DF] rounded-lg p-3.5 flex flex-col justify-between hover:border-[#C5D2CA] transition-colors shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1D2630]">
                            {ep.name}
                          </span>
                        </div>
                        <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] uppercase tracking-wider block">
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
                        <span className="text-[#56636B]">Protocol:</span>
                        <span className="font-['JetBrains_Mono'] text-[#1D2630] font-semibold bg-[#FBFCFA] px-1.5 py-0.5 rounded border border-[#D3DDD7]">
                          {ep.protocol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#56636B]">Authentication:</span>
                        <span className="font-['Inter'] text-[#1D2630] font-medium">
                          {ep.auth}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#56636B]">Round-Trip Ping:</span>
                        <span className="font-['JetBrains_Mono'] font-bold text-[#1F4E79]">
                          {ep.status === 'Checking' ? 'Testing...' : ep.pingMs !== null ? `${ep.pingMs} ms` : 'No response'}
                        </span>
                      </div>
                      {ep.detail && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#56636B] shrink-0">Last Check:</span>
                          <span className={`font-['JetBrains_Mono'] text-right ${STATUS_STYLES[ep.status].text}`}>
                            {ep.detail}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#56636B] shrink-0">Notice Ingestion:</span>
                        <span className="font-['JetBrains_Mono'] text-right text-[#1D2630]">
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

                  <div className="pt-2 border-t border-[#D3DDD7] flex items-center justify-between">
                    <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] truncate max-w-[260px]">
                      {ep.url}
                    </span>
                    <button
                      onClick={() => handleCopy(ep.url)}
                      className="text-[#56636B] hover:text-[#1F4E79] transition-colors p-1 rounded"
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
              <div className="bg-[#F4F7F4] border border-[#DCE4DF] rounded-lg p-4">
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1D2630] mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#1F4E79] text-lg">schema</span>
                  <span>Automated Continuous Ingestion Loop</span>
                </h4>
                <p className="font-['Inter'] text-[12px] text-[#3C4852] leading-relaxed mb-3">
                  The RegSonar Sentinel server worker queries official public government endpoints every {autoSyncInterval ? `${autoSyncInterval / 60} minutes` : 'configured cycle'}. Each source is fetched at most once every 10 minutes to respect government rate limits; failed sources keep their last good results and report the error.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                  <div className="p-3 bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-[#1F4E79] block mb-1">
                      1. Ingestion Layer
                    </span>
                    <span className="text-[#3C4852]">
                      Fetches JSON from the US Federal Register and MAS news search, RSS from HKMA, the Bank of England PRA, the FCA and BIS, and HKMA liquidity figures from its Daily Monetary Statistics page. The FCA feed is behind a Cloudflare bot check and is sometimes blocked.
                    </span>
                  </div>

                  <div className="p-3 bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-[#1F4E79] block mb-1">
                      2. Classification
                    </span>
                    <span className="text-[#3C4852]">
                      Keyword rules assign sector and instrument format. Impact scores are a heuristic by document type, not an AI assessment.
                    </span>
                  </div>

                  <div className="p-3 bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg">
                    <span className="font-['JetBrains_Mono'] font-bold text-[#1F4E79] block mb-1">
                      3. Live Client Push
                    </span>
                    <span className="text-[#3C4852]">
                      Replaces the feed with the latest notices from every source and recomputes the KPI ribbon, filters and deadlines.
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-['Hanken_Grotesk'] text-[13px] font-bold text-[#1D2630]">
                    Key Points (extractive)
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] font-bold bg-[#D9E5EE] text-[#1F4E79] border border-[#B3C8D9] px-2 py-0.5 rounded">
                    TextRank • OCR for scanned PDFs • No external API
                  </span>
                </div>
                <p className="font-['Inter'] text-[12px] text-[#56636B] leading-relaxed">
                  The server fetches each source document, extracts the article text (or the text layer of a PDF, for HKMA circulars and consultations) and ranks its sentences with TextRank. Scanned PDFs are first read with Tesseract OCR on the server; those key points are labelled OCR because recognition can misread characters. The top sentences are shown word for word, so every key point can be checked against the source. Dated sentences (comment deadlines, effective dates) are picked out by rule, and only future dates are kept.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#E3EBE6] border-t border-[#D3DDD7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${headerTone.dot}`}></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#3C4852]">
              {operationalCount} of {endpoints.length} monitored endpoints operational
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#FBFCFA] hover:bg-[#F4F7F4] border border-[#C5D2CA] text-[#1D2630] text-[12px] font-semibold rounded-lg transition-colors shadow-2xs"
          >
            Close Gateway
          </button>
        </div>
      </div>
    </div>
  );
};

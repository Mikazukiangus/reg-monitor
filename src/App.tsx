import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { KpiRibbon } from './components/KpiRibbon';
import { FilterSidebar } from './components/FilterSidebar';
import { NoticeCard } from './components/NoticeCard';
import { RightSidebar } from './components/RightSidebar';
import { Footer } from './components/Footer';

// Screens
import { RadarScreen } from './components/screens/RadarScreen';
import { HorizonScreen } from './components/screens/HorizonScreen';
import { EnforcementScreen } from './components/screens/EnforcementScreen';
import { AlertRulesScreen } from './components/screens/AlertRulesScreen';

// Modals
import { GapAnalysisModal } from './components/modals/GapAnalysisModal';
import { PdfDossierModal } from './components/modals/PdfDossierModal';
import { ExportModal } from './components/modals/ExportModal';
import { LiveEndpointsModal, EndpointMetric } from './components/modals/LiveEndpointsModal';

import { daysUntil, deriveDeadlines, deriveNotifications, sortNewestFirst } from './lib/derived';
import {
  RegulatoryNotice,
  JurisdictionCode,
  SectorDomain,
  UrgencySeverity
} from './types/regulatory';

// Mirrors ENDPOINTS in server.ts; status is filled in by /api/feeds/status
const DEFAULT_ENDPOINTS: EndpointMetric[] = [
  { id: 'fed-reg', name: 'US Federal Register API', agency: 'SEC & CFTC', jurisdiction: 'US Federal', url: 'https://www.federalregister.gov/api/v1/documents.json', protocol: 'REST JSON', auth: 'Public / None', ingests: true },
  { id: 'hkma-rss', name: 'HKMA RSS Feeds', agency: 'HKMA (Hong Kong)', jurisdiction: 'Hong Kong', url: 'https://www.hkma.gov.hk/eng/other-information/rss/rss_press-release.xml', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'hkma-api', name: 'HKMA Open API (liquidity figures)', agency: 'HKMA liquidity data (Hong Kong)', jurisdiction: 'Hong Kong', url: 'https://api.hkma.gov.hk/public/press-releases', protocol: 'REST JSON', auth: 'Public / None', ingests: true },
  { id: 'fca-rss', name: 'UK FCA News RSS', agency: 'FCA (United Kingdom)', jurisdiction: 'United Kingdom', url: 'https://www.fca.org.uk/news/rss.xml', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'boe-pra', name: 'Bank of England PRA Publications RSS', agency: 'PRA (United Kingdom)', jurisdiction: 'United Kingdom', url: 'https://www.bankofengland.co.uk/rss/prudential-regulation-publications', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'mas-gov', name: 'Singapore MAS News Search API', agency: 'MAS (Singapore)', jurisdiction: 'Singapore', url: 'https://www.mas.gov.sg/api/v1/search', protocol: 'JSON (undocumented)', auth: 'Public / None', ingests: true },
  { id: 'asic-gov', name: 'Australia ASIC Portal', agency: 'ASIC (Australia)', jurisdiction: 'Australia', url: 'https://asic.gov.au', protocol: 'HTTPS Portal', auth: 'Public / None', ingests: false },
  { id: 'bis-portal', name: 'BIS Media Releases RSS', agency: 'BIS & Basel Committee', jurisdiction: 'Global', url: 'https://www.bis.org/doclist/all_pressrels.rss', protocol: 'RSS 1.0 (RDF)', auth: 'Public / None', ingests: true }
].map(ep => ({ ...ep, status: 'Checking' as const, pingMs: null }));

interface SourceSyncResult {
  endpointId: string;
  ok: boolean;
  count: number;
  error?: string;
}

// Combine per-source sync results into one summary per endpoint
function mergeSyncResults(endpoints: EndpointMetric[], sources: SourceSyncResult[]): EndpointMetric[] {
  return endpoints.map(ep => {
    const mine = sources.filter(s => s.endpointId === ep.id);
    if (mine.length === 0) return ep;
    const failed = mine.filter(s => !s.ok);
    return {
      ...ep,
      sync: {
        ok: failed.length === 0,
        count: mine.reduce((acc, s) => acc + s.count, 0),
        error: failed.map(s => s.error).join('; ') || undefined
      }
    };
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');

  // Live notices from /api/feeds/sync; there is no sample data
  const [notices, setNotices] = useState<RegulatoryNotice[]>([]);
  const [hasSynced, setHasSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Live Endpoints & Ingestion Gateway State
  const [endpoints, setEndpoints] = useState<EndpointMetric[]>(DEFAULT_ENDPOINTS);
  const [isEndpointsModalOpen, setIsEndpointsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('Not synced yet');
  const [autoSyncInterval, setAutoSyncInterval] = useState(180); // 3 minutes

  // Search & Global Jurisdiction Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [feedKeywordSearch, setFeedKeywordSearch] = useState('');
  const [headerJurisdiction, setHeaderJurisdiction] = useState('All APAC');

  // Filter Facets
  const [selectedSeverities, setSelectedSeverities] = useState<UrgencySeverity[]>(['critical', 'high', 'info']);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<Record<JurisdictionCode, boolean>>({
    SG: true,
    HK: true,
    AU: true,
    JP: true,
    UK_EU: true,
    US: true,
    GLOBAL: true
  });
  const [selectedSectors, setSelectedSectors] = useState<Record<SectorDomain, boolean>>({
    'FinTech & Digital Assets': true,
    'Banking & Capital Markets': true,
    'ESG & Sustainability': true,
    'AI Governance & Ethics': false,
    'AML/CFT & Sanctions': false
  });
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'Highest Impact Score' | 'Most Recent First' | 'Consultation Deadline'>('Most Recent First');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Bookmarks
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Active Modals
  const [activeNoticeForGap, setActiveNoticeForGap] = useState<RegulatoryNotice | null>(null);
  const [activeNoticeForDossier, setActiveNoticeForDossier] = useState<RegulatoryNotice | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);

  // Toggle Filters
  const handleToggleSeverity = (sev: UrgencySeverity) => {
    setSelectedSeverities(prev =>
      prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev]
    );
    setCurrentPage(1);
  };

  const handleToggleJurisdiction = (code: JurisdictionCode) => {
    setSelectedJurisdictions(prev => ({ ...prev, [code]: !prev[code] }));
    setCurrentPage(1);
  };

  const handleToggleSector = (sec: SectorDomain) => {
    setSelectedSectors(prev => ({ ...prev, [sec]: !prev[sec] }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSelectedSeverities(['critical', 'high', 'info']);
    setSelectedJurisdictions({
      SG: true,
      HK: true,
      AU: true,
      JP: true,
      UK_EU: true,
      US: true,
      GLOBAL: true
    });
    setSelectedSectors({
      'FinTech & Digital Assets': true,
      'Banking & Capital Markets': true,
      'ESG & Sustainability': true,
      'AI Governance & Ethics': true,
      'AML/CFT & Sanctions': true
    });
    setSelectedFormat(null);
    setSearchQuery('');
    setFeedKeywordSearch('');
    setHeaderJurisdiction('All APAC');
    setCurrentPage(1);
  };

  const handleToggleBookmark = (id: string) => {
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Live Feed Ingestion handlers
  const handleSyncFeeds = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/feeds/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.notices && Array.isArray(data.notices)) {
          // The server returns the full current live set, so replace rather than append
          setNotices(data.notices);
        }
        setHasSynced(true);
        setSyncError(null);
        if (Array.isArray(data.endpoints) && Array.isArray(data.sources)) {
          setEndpoints(mergeSyncResults(data.endpoints, data.sources));
        }
        const now = new Date();
        setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' }) + ' SGT');
      } else {
        setSyncError(`The feed server returned HTTP ${res.status}.`);
      }
    } catch (err) {
      console.warn('[RegSonar] Live feed sync note:', err);
      setSyncError('The feed server could not be reached.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePingEndpoints = async () => {
    setIsPinging(true);
    try {
      const res = await fetch('/api/feeds/status');
      if (res.ok) {
        const data = await res.json();
        if (data.endpoints && Array.isArray(data.endpoints)) {
          // Keep the last sync summary; status probes don't fetch notices
          setEndpoints(prev =>
            data.endpoints.map((ep: EndpointMetric) => ({ ...ep, sync: prev.find(p => p.id === ep.id)?.sync }))
          );
        }
      }
    } catch (err) {
      console.warn('[RegSonar] Endpoint ping note:', err);
    } finally {
      setIsPinging(false);
    }
  };

  // Automated background polling
  React.useEffect(() => {
    handlePingEndpoints();
    handleSyncFeeds();

    if (!autoSyncInterval || autoSyncInterval <= 0) return;
    const intervalId = setInterval(() => {
      handleSyncFeeds();
    }, autoSyncInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoSyncInterval]);

  const jurisdictionCounts = useMemo(() => {
    const counts: Record<JurisdictionCode, number> = { SG: 0, HK: 0, AU: 0, JP: 0, UK_EU: 0, US: 0, GLOBAL: 0 };
    notices.forEach(n => {
      counts[n.jurisdictionCode] += 1;
    });
    return counts;
  }, [notices]);

  const severityCounts = useMemo(() => {
    const counts: Record<UrgencySeverity, number> = { critical: 0, high: 0, info: 0 };
    notices.forEach(n => {
      counts[n.severity] += 1;
    });
    return counts;
  }, [notices]);

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notices.forEach(n => {
      counts[n.format] = (counts[n.format] || 0) + 1;
    });
    return counts;
  }, [notices]);

  const recentCount = notices.filter(
    n => n.publishedAt && Date.now() - new Date(n.publishedAt).getTime() <= 7 * 24 * 60 * 60 * 1000
  ).length;
  const closingSoonCount = notices.filter(n => {
    if (n.format !== 'Consultations' || !n.deadlineDate) return false;
    const d = daysUntil(n.deadlineDate);
    return d >= 0 && d <= 14;
  }).length;

  const ingestingSources = endpoints.filter(ep => ep.ingests && ep.sync?.ok).map(ep => ep.agency.replace(/ \(.*\)$/, ''));

  // Filter Notices
  const filteredNotices = useMemo(() => {
    return notices.filter(notice => {
      // Header dropdown filter
      if (headerJurisdiction === 'Singapore MAS' && notice.jurisdictionCode !== 'SG') return false;
      if (headerJurisdiction === 'Hong Kong HKMA/SFC' && notice.jurisdictionCode !== 'HK') return false;
      if (headerJurisdiction === 'Australia ASIC' && notice.jurisdictionCode !== 'AU') return false;
      if (headerJurisdiction === 'Japan JFSA' && notice.jurisdictionCode !== 'JP') return false;
      if (headerJurisdiction === 'Global Cross-Border' && notice.jurisdictionCode !== 'UK_EU' && notice.jurisdictionCode !== 'US' && notice.jurisdictionCode !== 'GLOBAL') return false;

      // Severity check
      if (selectedSeverities.length > 0 && !selectedSeverities.includes(notice.severity)) {
        return false;
      }

      // Jurisdiction check
      if (!selectedJurisdictions[notice.jurisdictionCode]) {
        return false;
      }

      // Sector check
      if (!selectedSectors[notice.sector]) {
        return false;
      }

      // Format check
      if (selectedFormat && notice.format !== selectedFormat) {
        return false;
      }

      // Global search & feed keyword search
      const query = (searchQuery + ' ' + feedKeywordSearch).trim().toLowerCase();
      if (query) {
        const matchTitle = notice.title.toLowerCase().includes(query);
        const matchRef = notice.ref.toLowerCase().includes(query);
        const matchReg = notice.regulator.toLowerCase().includes(query);
        const matchTags = notice.tags.some(t => t.toLowerCase().includes(query));
        const matchSummary = notice.summary?.toLowerCase().includes(query);
        const matchAi = notice.keyPoints?.points.some(p => p.toLowerCase().includes(query));
        if (!matchTitle && !matchRef && !matchReg && !matchTags && !matchSummary && !matchAi) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'Highest Impact Score') {
        return b.impactScore - a.impactScore;
      }
      if (sortBy === 'Most Recent First') {
        // Sample notices have no real publish date, so they sort after live ones
        return (b.publishedAt || '').localeCompare(a.publishedAt || '');
      }
      if (sortBy === 'Consultation Deadline') {
        return (a.deadlineDate || '9999').localeCompare(b.deadlineDate || '9999');
      }
      return 0;
    });
  }, [
    notices,
    headerJurisdiction,
    selectedSeverities,
    selectedJurisdictions,
    selectedSectors,
    selectedFormat,
    searchQuery,
    feedKeywordSearch,
    sortBy
  ]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredNotices.length / itemsPerPage));
  const currentNotices = filteredNotices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const deadlines = useMemo(() => deriveDeadlines(notices), [notices]);
  const notifications = useMemo(() => deriveNotifications(notices), [notices]);
  const latestNotices = useMemo(() => sortNewestFirst(notices).slice(0, 5), [notices]);

  const handleSelectNoticeById = (id: string) => {
    setActiveTab('feed');
    const target = notices.find(n => n.id === id);
    if (target) {
      setActiveNoticeForDossier(target);
    }
  };

  return (
    <div className="bg-[#FAF7F2] font-['Inter'] text-[#1E1B18] antialiased min-h-screen flex flex-col">
      {/* Fixed Top Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedJurisdictionFilter={headerJurisdiction}
        onJurisdictionFilterChange={setHeaderJurisdiction}
        onOpenExport={() => {
          setExportFormat('csv');
          setIsExportModalOpen(true);
        }}
        notifications={notifications}
        onSelectNotice={handleSelectNoticeById}
        onOpenEndpointsModal={() => setIsEndpointsModalOpen(true)}
        isSyncing={isSyncing}
        onTriggerSync={handleSyncFeeds}
        lastSyncTime={lastSyncTime}
        endpoints={endpoints}
      />

      {/* Navigation Sub-bar & Real-Time Wire */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        wireItems={latestNotices}
        onSelectNotice={handleSelectNoticeById}
      />

      {/* Main Content Viewport */}
      <main className="w-full pt-32 bg-[#FAF7F2] min-h-screen flex-1 flex flex-col">
        {activeTab === 'feed' && (
          <div className="flex flex-col w-full">
            {/* Executive KPI Ribbon */}
            <KpiRibbon
              totalNoticesCount={notices.length}
              criticalCount={notices.filter(n => n.severity === 'critical').length}
              consultationsCount={formatCounts.Consultations || 0}
              recentCount={recentCount}
              closingSoonCount={closingSoonCount}
              endpoints={endpoints}
              onFilterBySeverity={(sev) => {
                if (sev === 'critical') {
                  setSelectedSeverities(['critical']);
                } else {
                  setSelectedSeverities(['critical', 'high', 'info']);
                }
              }}
              onFilterByFormat={(fmt) => {
                setSelectedFormat(selectedFormat === fmt ? null : fmt);
              }}
            />

            {/* 3-Column Analytical Grid */}
            <div className="w-full px-4 sm:px-6 py-4 flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Rail (3 cols): Filters & Facets + Mesh */}
                <FilterSidebar
                  selectedSeverities={selectedSeverities}
                  onToggleSeverity={handleToggleSeverity}
                  selectedJurisdictions={selectedJurisdictions}
                  onToggleJurisdiction={handleToggleJurisdiction}
                  selectedSectors={selectedSectors}
                  onToggleSector={handleToggleSector}
                  selectedFormat={selectedFormat}
                  onSelectFormat={setSelectedFormat}
                  onResetFilters={handleResetFilters}
                  jurisdictionCounts={jurisdictionCounts}
                  severityCounts={severityCounts}
                  formatCounts={formatCounts}
                  endpoints={endpoints}
                  onPingEndpoints={handlePingEndpoints}
                  isPinging={isPinging}
                />

                {/* Center Feed (6 cols): Active Notices Feed */}
                <section className="lg:col-span-6 flex flex-col gap-3">
                  {/* Live Feeds Connected Status Strip */}
                  <div className="bg-[#FFFFFF] border border-[#E5DFD5] px-3.5 py-2 rounded-lg flex items-center justify-between text-[11px] shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse"></span>
                      <span className="font-['JetBrains_Mono'] font-bold text-[#1E1B18]">
                        Automated Feed Ingestion
                      </span>
                      <span className="text-[#857F74] hidden sm:inline">•</span>
                      <span className="text-[#857F74] hidden sm:inline">
                        {ingestingSources.length > 0 ? ingestingSources.join(', ') : 'Waiting for first sync'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74]">
                        {lastSyncTime}
                      </span>
                      <button
                        onClick={() => setIsEndpointsModalOpen(true)}
                        className="text-[#0D5C63] hover:text-[#0A474D] font-bold text-[11px] flex items-center gap-0.5 cursor-pointer ml-1"
                      >
                        <span>Endpoints Gateway</span>
                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      </button>
                    </div>
                  </div>

                  {/* Feed Search & Sort Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-[#FFFFFF] border border-[#E5DFD5] p-2.5 rounded-lg shadow-xs">
                    <div className="relative flex-1">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-[#857F74] text-lg pointer-events-none">
                        search
                      </span>
                      <input
                        type="text"
                        value={feedKeywordSearch}
                        onChange={(e) => {
                          setFeedKeywordSearch(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Filter alerts by legal keyword, citation, act..."
                        className="w-full h-8 pl-9 pr-3 bg-[#FAF8F5] border border-[#E5DFD5] rounded text-[#1E1B18] placeholder:text-[#857F74] font-['Inter'] text-[12px] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#0D5C63] transition-all"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] hidden md:inline font-medium">
                        Sort:
                      </span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="h-8 px-2 bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded focus:outline-none focus:border-[#0D5C63] cursor-pointer"
                      >
                        <option value="Highest Impact Score">Highest Impact Score</option>
                        <option value="Most Recent First">Most Recent First</option>
                        <option value="Consultation Deadline">Consultation Deadline</option>
                      </select>

                      <button
                        onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
                        className={`h-8 w-8 flex items-center justify-center border rounded transition-colors ${
                          density === 'compact'
                            ? 'bg-[#0D5C63] text-white border-[#0D5C63]'
                            : 'bg-[#FAF8F5] border-[#E5DFD5] text-[#57534E] hover:text-[#1E1B18]'
                        }`}
                        title="Feed Density Toggle"
                      >
                        <span className="material-symbols-outlined text-base">view_agenda</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Notice Feed Cards */}
                  <div className="space-y-3">
                    {currentNotices.length > 0 ? (
                      currentNotices.map((notice) => (
                        <NoticeCard
                          key={notice.id}
                          notice={notice}
                          onOpenGapAnalysis={(n) => setActiveNoticeForGap(n)}
                          onOpenPdfDossier={(n) => setActiveNoticeForDossier(n)}
                          onToggleBookmark={handleToggleBookmark}
                          isBookmarked={bookmarkedIds.has(notice.id)}
                          density={density}
                        />
                      ))
                    ) : !hasSynced && syncError ? (
                      <div className="bg-[#FFFFFF] border border-[#FDE68A] rounded-lg p-8 text-center space-y-2 shadow-xs">
                        <span className="material-symbols-outlined text-3xl text-[#B45309]">cloud_off</span>
                        <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1E1B18]">
                          Live notices could not be loaded
                        </h4>
                        <p className="text-[12px] text-[#57534E]">
                          {syncError} RegSonar shows no sample data, so the feed stays empty until a sync succeeds.
                        </p>
                        <button
                          onClick={handleSyncFeeds}
                          disabled={isSyncing}
                          className="mt-1 px-3 py-1.5 bg-[#0D5C63] hover:bg-[#09454A] text-white text-[12px] font-semibold rounded disabled:opacity-60"
                        >
                          {isSyncing ? 'Retrying...' : 'Retry sync'}
                        </button>
                      </div>
                    ) : !hasSynced ? (
                      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-8 text-center space-y-2 shadow-xs">
                        <span className="material-symbols-outlined text-3xl text-[#0D5C63] animate-spin">sync</span>
                        <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1E1B18]">
                          Loading live notices from regulators...
                        </h4>
                        <p className="text-[12px] text-[#57534E]">
                          The first sync fetches each source document, so it can take a few seconds.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-8 text-center space-y-2 shadow-xs">
                        <span className="material-symbols-outlined text-3xl text-[#857F74]">find_in_page</span>
                        <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1E1B18]">
                          No statutory publications match current filters
                        </h4>
                        <p className="text-[12px] text-[#57534E]">
                          Try adjusting your jurisdiction selections or reset the filter facets.
                        </p>
                        <button
                          onClick={handleResetFilters}
                          className="px-3.5 py-1.5 bg-[#0D5C63] text-white text-[12px] font-semibold rounded hover:bg-[#09454A] transition-colors mt-2 shadow-xs"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pagination Ribbon */}
                  <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg flex items-center justify-between text-[12px] text-[#57534E] shadow-xs">
                    <span>
                      Showing {Math.min(filteredNotices.length, (currentPage - 1) * itemsPerPage + 1)} to{' '}
                      {Math.min(filteredNotices.length, currentPage * itemsPerPage)} of{' '}
                      {filteredNotices.length} notices
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                          currentPage === 1
                            ? 'bg-[#F5F1E8] text-[#857F74] cursor-not-allowed border border-[#E5DFD5]'
                            : 'bg-[#FAF8F5] text-[#1E1B18] border border-[#E5DFD5] hover:bg-[#F5F1E8]'
                        }`}
                      >
                        Previous
                      </button>

                      {Array.from({ length: totalPages }).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentPage(idx + 1)}
                          className={`px-3 py-1 rounded font-['Inter'] text-[11px] font-semibold transition-colors ${
                            currentPage === idx + 1
                              ? 'bg-[#0D5C63] text-white shadow-2xs'
                              : 'bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] hover:bg-[#F5F1E8]'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                          currentPage === totalPages
                            ? 'bg-[#F5F1E8] text-[#857F74] cursor-not-allowed border border-[#E5DFD5]'
                            : 'bg-[#FAF8F5] text-[#1E1B18] border border-[#E5DFD5] hover:bg-[#F5F1E8]'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>

                {/* Right Rail (3 cols): Deadlines, Export */}
                <RightSidebar
                  deadlines={deadlines}
                  onOpenExportCsv={() => {
                    setExportFormat('csv');
                    setIsExportModalOpen(true);
                  }}
                  onOpenExportJson={() => {
                    setExportFormat('json');
                    setIsExportModalOpen(true);
                  }}
                  onSelectDeadlineNotice={handleSelectNoticeById}
                  onOpenLiveEndpointsModal={() => setIsEndpointsModalOpen(true)}
                  onTriggerSync={handleSyncFeeds}
                  isSyncing={isSyncing}
                  endpoints={endpoints}
                />
              </div>
            </div>
          </div>
        )}

        {/* Screen 2: APAC Regulatory Radar */}
        {activeTab === 'radar' && <RadarScreen notices={notices} onSelectNotice={handleSelectNoticeById} />}

        {/* Screen 3: Impact & Horizon Tracker */}
        {activeTab === 'horizon' && <HorizonScreen notices={notices} onSelectNotice={handleSelectNoticeById} />}

        {/* Screen 4: Enforcement & Sanctions */}
        {activeTab === 'enforcement' && <EnforcementScreen notices={notices} onSelectNotice={handleSelectNoticeById} />}

        {/* Screen 5: Custom Alert Rules */}
        {activeTab === 'alert-rules' && <AlertRulesScreen notices={notices} />}
      </main>

      {/* Institutional Footer */}
      <Footer
        endpoints={endpoints}
        onOpenMethodology={() =>
          setInfoModal({
            title: 'Statutory Ingestion Methodology',
            body: 'Live notices are pulled from public sources: the US Federal Register API (SEC, CFTC), the HKMA press release, circular and consultation RSS feeds, the MAS news search API, and the BIS media releases RSS feed. UK coverage comes from the Bank of England PRA publications RSS feed and the UK FCA RSS feed (the FCA feed is sometimes blocked by a Cloudflare bot check). HKMA daily liquidity figures come from the HKMA Open API, whose firewall can block cloud servers. ASIC is status-checked only. Each source is fetched at most once every 10 minutes (the HKMA Open API every 30 minutes). HKMA circulars and consultations are PDFs, so they have no key points; open the document to read them. Key points are extractive: the server fetches each official document once and quotes its most central sentences verbatim, ranked with TextRank, alongside dated sentences and reference numbers found by rules. No AI model or external API is used, so nothing is paraphrased. Impact scores are a heuristic by document type (for example, enforcement and proposed rules score higher), not a legal assessment. Every notice shown comes from a live source; there is no sample data.'
          })
        }
        onOpenAuditLog={() =>
          setInfoModal({
            title: 'Source Status',
            body: `Last sync: ${lastSyncTime}\n\n${endpoints
              .map(ep => `${ep.name}: ${ep.status}${ep.detail ? ` (${ep.detail})` : ''}${ep.ingests && ep.sync ? ` · ${ep.sync.ok ? `${ep.sync.count} notices` : `sync failed: ${ep.sync.error}`}` : ''}`)
              .join('\n')}\n\nNo audit log is persisted yet; this shows the current session's source status only.`
          })
        }
        onOpenSecurity={() =>
          setInfoModal({
            title: 'Security',
            body: 'RegSonar reads only public regulator publications and stores nothing beyond an in-memory cache on the server. No user accounts or personal data are collected. The project holds no security certifications.'
          })
        }
      />

      {/* Interactive Modals */}
      {activeNoticeForGap && (
        <GapAnalysisModal
          key={activeNoticeForGap.id}
          notice={activeNoticeForGap}
          onClose={() => setActiveNoticeForGap(null)}
        />
      )}

      <PdfDossierModal
        notice={activeNoticeForDossier}
        onClose={() => setActiveNoticeForDossier(null)}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        notices={filteredNotices}
        initialFormat={exportFormat}
      />

      <LiveEndpointsModal
        isOpen={isEndpointsModalOpen}
        onClose={() => setIsEndpointsModalOpen(false)}
        endpoints={endpoints}
        onPingAll={handlePingEndpoints}
        onSyncAll={handleSyncFeeds}
        isSyncing={isSyncing}
        isPinging={isPinging}
        lastSyncTime={lastSyncTime}
        autoSyncInterval={autoSyncInterval}
        onChangeAutoSyncInterval={setAutoSyncInterval}
      />

      {/* Info Notice Modal */}
      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-lg shadow-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5DFD5]">
              <h3 className="font-['Hanken_Grotesk'] text-[17px] font-bold text-[#1E1B18]">
                {infoModal.title}
              </h3>
              <button
                onClick={() => setInfoModal(null)}
                className="text-[#857F74] hover:text-[#1E1B18]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <p className="text-[13px] text-[#57534E] leading-relaxed whitespace-pre-wrap font-['Inter']">
              {infoModal.body}
            </p>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInfoModal(null)}
                className="px-4 py-1.5 bg-[#0D5C63] text-white text-[12px] font-semibold rounded hover:bg-[#09454A] shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

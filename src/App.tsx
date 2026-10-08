import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { KpiRibbon } from './components/KpiRibbon';
import { FilterSidebar } from './components/FilterSidebar';
import { NoticeCard } from './components/NoticeCard';
import { RightSidebar } from './components/RightSidebar';
import { Footer } from './components/Footer';
import { BottomNav } from './components/BottomNav';
import { NextUpStrip } from './components/NextUpStrip';
import { searchTerms } from './components/Highlight';
import { useDialog } from './components/useDialog';

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

import { daysUntil, deriveDeadlines, deriveNotifications, sgtTime, sortNewestFirst } from './lib/derived';
import { calendarNotices, downloadIcs } from './lib/ics';
import { copyText, defaultViewState, noticeLink, parseViewState, serializeViewState, SortOption } from './lib/urlState';
import { readPreviousVisit, recordVisit } from './lib/visits';
import { SECTORS } from './lib/tagging';
import { commentsClosed } from './lib/impact';
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
  { id: 'hkma-dms', name: 'HKMA Daily Monetary Statistics', agency: 'HKMA liquidity data (Hong Kong)', jurisdiction: 'Hong Kong', url: 'https://www.hkma.gov.hk/eng/data-publications-and-research/data-and-statistics/daily-monetary-statistics/', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'fca-rss', name: 'UK FCA News RSS', agency: 'FCA (United Kingdom)', jurisdiction: 'United Kingdom', url: 'https://www.fca.org.uk/news/rss.xml', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'boe-pra', name: 'Bank of England PRA Publications RSS', agency: 'PRA (United Kingdom)', jurisdiction: 'United Kingdom', url: 'https://www.bankofengland.co.uk/rss/prudential-regulation-publications', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'mas-gov', name: 'Singapore MAS News Search API', agency: 'MAS (Singapore)', jurisdiction: 'Singapore', url: 'https://www.mas.gov.sg/api/v1/search', protocol: 'JSON (undocumented)', auth: 'Public / None', ingests: true },
  { id: 'sfc-rss', name: 'SFC RSS Feeds', agency: 'SFC (Hong Kong)', jurisdiction: 'Hong Kong', url: 'https://www.sfc.hk/en/RSS-Feeds/Press-releases', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'hkex-rss', name: 'HKEX Regulatory Announcements RSS', agency: 'HKEX (Hong Kong)', jurisdiction: 'Hong Kong', url: 'https://www.hkex.com.hk/Services/RSS-Feeds/regulatory-announcements?sc_lang=en', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'esma-rss', name: 'ESMA News RSS', agency: 'ESMA (European Union)', jurisdiction: 'European Union', url: 'https://www.esma.europa.eu/rss.xml', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'fsb-rss', name: 'FSB Publications RSS', agency: 'FSB (Global)', jurisdiction: 'Global', url: 'https://www.fsb.org/feed/', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'asic-gov', name: 'ASIC Media Releases', agency: 'ASIC (Australia)', jurisdiction: 'Australia', url: 'https://download.asic.gov.au/asic-nga/data/newsroom/newsroom-mr-latest.json', protocol: 'JSON (behind ASIC newsroom page)', auth: 'Public / None', ingests: true },
  { id: 'jfsa-rss', name: 'JFSA English News RSS', agency: 'JFSA (Japan)', jurisdiction: 'Japan', url: 'https://www.fsa.go.jp/fsaEnNewsList_rss2.xml', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'sgx-regco', name: 'SGX RegCo Content API', agency: 'SGX RegCo (Singapore)', jurisdiction: 'Singapore', url: 'https://api2.sgx.com/regco/content-api', protocol: 'JSON (behind SGX RegCo pages)', auth: 'Public / None', ingests: true },
  { id: 'asx-consult', name: 'ASX Public Consultations', agency: 'ASX (Australia)', jurisdiction: 'Australia', url: 'https://www.asx.com.au/about/regulation/consultations-and-submissions', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'jpx-rules', name: 'JPX Rule Revisions', agency: 'TSE, OSE, TOCOM, JPX-R (Japan)', jurisdiction: 'Japan', url: 'https://www.jpx.co.jp/english/rules-participants/rules/revise/index.html', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'bnm-rss', name: 'BNM Press Releases', agency: 'BNM (Malaysia)', jurisdiction: 'Malaysia', url: 'https://www.bnm.gov.my/press-release-2026', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'sc-my', name: 'SC Malaysia Media Releases', agency: 'SC Malaysia', jurisdiction: 'Malaysia', url: 'https://www.sc.com.my/resources/media/media-release', protocol: 'HTML (list data in page)', auth: 'Public / None', ingests: true },
  { id: 'finra-rss', name: 'FINRA Notices RSS', agency: 'FINRA (United States)', jurisdiction: 'US', url: 'https://www.finra.org/rules-guidance/notices/rss', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'bis-portal', name: 'BIS Media Releases RSS', agency: 'BIS & Basel Committee', jurisdiction: 'Global', url: 'https://www.bis.org/doclist/all_pressrels.rss', protocol: 'RSS 1.0 (RDF)', auth: 'Public / None', ingests: true }
].map(ep => ({ ...ep, status: 'Checking' as const, pingMs: null }));

interface SourceSyncResult {
  endpointId: string;
  ok: boolean;
  count: number;
  lastSuccessAt?: string | null;
  error?: string;
}

// A cached sync older than this is followed by a fresh one
const STALE_SYNC_MS = 10 * 60 * 1000;

// Combine per-source sync results into one summary per endpoint
function mergeSyncResults(endpoints: EndpointMetric[], sources: SourceSyncResult[]): EndpointMetric[] {
  return endpoints.map(ep => {
    const mine = sources.filter(s => s.endpointId === ep.id);
    if (mine.length === 0) return ep;
    const failed = mine.filter(s => !s.ok);
    // The endpoint's data is as old as its least recently fetched source
    const times = mine.map(s => s.lastSuccessAt);
    const lastSuccessAt = times.some(t => !t) ? null : times.sort()[0] ?? null;
    return {
      ...ep,
      sync: {
        ok: failed.length === 0,
        count: mine.reduce((acc, s) => acc + s.count, 0),
        error: failed.map(s => s.error).join('; ') || undefined,
        lastSuccessAt
      }
    };
  });
}

export default function App() {
  // The view in the URL when the page opened (a shared link, or a reload)
  const [initialView] = useState(() => parseViewState(window.location.search));
  // Notices this browser had seen before this page load; null on a first visit
  const [previousVisit] = useState(() => readPreviousVisit());

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialView.tab);

  // Live notices from /api/feeds/sync; there is no sample data
  const [notices, setNotices] = useState<RegulatoryNotice[]>([]);
  // The stored history, when the server has a database
  const [archive, setArchive] = useState<{ enabled: boolean; count?: number; since?: string | null; error?: string }>({ enabled: false });
  // Older notices found by searching the history, by search text
  const [archiveResults, setArchiveResults] = useState<{ query: string; notices: RegulatoryNotice[] } | null>(null);
  const [hasSynced, setHasSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Live Endpoints & Ingestion Gateway State
  const [endpoints, setEndpoints] = useState<EndpointMetric[]>(DEFAULT_ENDPOINTS);
  const [isEndpointsModalOpen, setIsEndpointsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // Set when the notices shown are the copy saved on this device (offline)
  const [savedCopyAt, setSavedCopyAt] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [isPinging, setIsPinging] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('Not synced yet');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [autoSyncInterval, setAutoSyncInterval] = useState(180); // 3 minutes

  // Search & Global Jurisdiction Filter
  const [searchQuery, setSearchQuery] = useState(initialView.search);
  const [feedKeywordSearch, setFeedKeywordSearch] = useState(initialView.keyword);
  const [headerJurisdiction, setHeaderJurisdiction] = useState('All');

  // Filter Facets
  const [selectedSeverities, setSelectedSeverities] = useState<UrgencySeverity[]>(initialView.severities);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<Record<JurisdictionCode, boolean>>(initialView.jurisdictions);
  const [selectedSectors, setSelectedSectors] = useState<Record<SectorDomain, boolean>>(initialView.sectors);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(initialView.format);
  const [sortBy, setSortBy] = useState<SortOption>(initialView.sort);
  const [onlyNew, setOnlyNew] = useState(initialView.onlyNew);
  // A notice named in the URL, opened once the notices have loaded
  const [pendingNoticeId, setPendingNoticeId] = useState<string | null>(initialView.noticeId);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
  const infoDialogRef = useDialog<HTMLDivElement>(!!infoModal, () => setInfoModal(null));
  const filterDrawerRef = useDialog<HTMLDivElement>(isFilterDrawerOpen, () => setIsFilterDrawerOpen(false));

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
    const defaults = defaultViewState();
    setSelectedSeverities(defaults.severities);
    setSelectedJurisdictions(defaults.jurisdictions);
    setSelectedSectors(defaults.sectors);
    setSelectedFormat(null);
    setOnlyNew(false);
    setSearchQuery('');
    setFeedKeywordSearch('');
    setHeaderJurisdiction('All');
    setCurrentPage(1);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(current => (current === message ? null : current)), 2500);
  };

  const handleCopyNoticeLink = async (notice: RegulatoryNotice) => {
    const ok = await copyText(noticeLink(notice.id));
    showToast(ok ? 'Link to this notice copied' : 'Could not copy; the link is in the address bar when the notice is open');
  };

  const handleCopyViewLink = async () => {
    const ok = await copyText(window.location.href);
    showToast(ok ? 'Link to this view copied' : 'Could not copy; use the address bar link');
  };

  const handleAddToCalendar = (notice: RegulatoryNotice) =>
    downloadIcs([notice], `RegSonar_${notice.id}.ics`);

  const handleToggleBookmark = (id: string) => {
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Live Feed Ingestion handlers. A GET may be answered from the CDN cache,
  // so the page fills quickly; force (POST) always fetches fresh data.
  const handleSyncFeeds = async (force = true): Promise<string | null> => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/feeds/sync', { method: force ? 'POST' : 'GET' });
      // The server allows each visitor a few refreshes a minute; the notices shown stay as they are
      if (res.status === 429) {
        const wait = res.headers.get('Retry-After');
        showToast(`Refreshed several times just now. Try again in ${wait ? `${wait} seconds` : 'a minute'}.`);
        return null;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.notices && Array.isArray(data.notices)) {
          // The server returns the full current live set, so replace rather than append
          setNotices(data.notices);
          if (data.archive) setArchive(data.archive);
          recordVisit(data.notices.map((n: RegulatoryNotice) => n.id));
        }
        setHasSynced(true);
        setSyncError(null);
        if (Array.isArray(data.endpoints) && Array.isArray(data.sources)) {
          setEndpoints(mergeSyncResults(data.endpoints, data.sources));
        }
        const syncedAt: string = data.lastSync || new Date().toISOString();
        setLastSyncAt(syncedAt);
        setLastSyncTime(sgtTime(syncedAt));
        // The service worker marks a copy it saved earlier; no point refreshing it while offline
        const savedAt = res.headers.get('X-RegSonar-Saved');
        setSavedCopyAt(savedAt);
        return savedAt ? null : syncedAt;
      }
      setSyncError(`The feed server returned HTTP ${res.status}.`);
    } catch (err) {
      console.warn('[RegSonar] Live feed sync note:', err);
      setSyncError('The feed server could not be reached.');
    } finally {
      setIsSyncing(false);
    }
    return null;
  };

  const syncNow = async () => {
    await handleSyncFeeds(true);
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

  // Refresh as soon as the connection comes back
  React.useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      handleSyncFeeds(true);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Automated background polling
  React.useEffect(() => {
    handlePingEndpoints();
    // Show the cached copy at once, then refresh it if it is getting old
    handleSyncFeeds(false).then(syncedAt => {
      if (syncedAt && Date.now() - new Date(syncedAt).getTime() > STALE_SYNC_MS) handleSyncFeeds(true);
    });

    if (!autoSyncInterval || autoSyncInterval <= 0) return;
    const intervalId = setInterval(() => {
      handleSyncFeeds(false);
    }, autoSyncInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoSyncInterval]);

  const jurisdictionCounts = useMemo(() => {
    const counts: Record<JurisdictionCode, number> = { SG: 0, MY: 0, HK: 0, AU: 0, JP: 0, UK_EU: 0, US: 0, GLOBAL: 0 };
    notices.forEach(n => {
      counts[n.jurisdictionCode] += 1;
    });
    return counts;
  }, [notices]);

  // Notices in each sector, counting every sector a notice has
  const sectorCounts = useMemo(() => {
    const counts = Object.fromEntries(SECTORS.map(s => [s, 0])) as Record<SectorDomain, number>;
    notices.forEach(n => {
      (n.sectors ?? [n.sector]).forEach(s => {
        if (s in counts) counts[s] += 1;
      });
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
  const consultations = notices.filter(n => n.format === 'Consultations');
  const openConsultationsCount = consultations.filter(n => !commentsClosed(n.statutoryDeadline)).length;
  const closingSoonCount = notices.filter(n => {
    if (n.format !== 'Consultations' || !n.deadlineDate) return false;
    const d = daysUntil(n.deadlineDate);
    return d >= 0 && d <= 14;
  }).length;

  const ingestingSources = endpoints.filter(ep => ep.ingests && ep.sync?.ok).map(ep => ep.agency.replace(/ \(.*\)$/, ''));

  // Notices from the stored history are older ones, so they never count as new
  const isNewNotice = (id: string) => !!previousVisit && !previousVisit.seenIds.has(id);
  const newCount = notices.filter(n => !n.archived && isNewNotice(n.id)).length;
  const activeFilterCount =
    (selectedSeverities.length < 3 ? 1 : 0) +
    Object.values(selectedJurisdictions).filter(v => !v).length +
    Object.values(selectedSectors).filter(v => !v).length +
    (selectedFormat ? 1 : 0) +
    (onlyNew ? 1 : 0);

  // Search the stored history as well, once the search text settles
  const searchText = (searchQuery + ' ' + feedKeywordSearch).trim();
  React.useEffect(() => {
    if (!archive.enabled || archive.error || searchText.length < 3) {
      setArchiveResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/notices/search?q=${encodeURIComponent(searchText)}`, { signal: controller.signal })
        .then(res => (res.ok ? res.json() : null))
        .then(data => data?.notices && setArchiveResults({ query: searchText, notices: data.notices }))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, archive.enabled, archive.error]);

  // Notices loaded with the feed, plus older ones the history search found
  const searchableNotices = useMemo(() => {
    if (!archiveResults || archiveResults.query !== searchText) return notices;
    const ids = new Set(notices.map(n => n.id));
    return [...notices, ...archiveResults.notices.filter(n => !ids.has(n.id))];
  }, [notices, archiveResults, searchText]);
  const archiveMatchIds = useMemo(
    () => new Set(archiveResults && archiveResults.query === searchText ? archiveResults.notices.map(n => n.id) : []),
    [archiveResults, searchText]
  );
  const highlightTerms = useMemo(() => searchTerms(searchText), [searchText]);

  // Filter Notices
  const filteredNotices = useMemo(() => {
    return searchableNotices.filter(notice => {
      // Header dropdown filter
      if (headerJurisdiction === 'Singapore MAS' && notice.jurisdictionCode !== 'SG') return false;
      if (headerJurisdiction === 'Malaysia' && notice.jurisdictionCode !== 'MY') return false;
      if (headerJurisdiction === 'Hong Kong HKMA' && notice.jurisdictionCode !== 'HK') return false;
      if (headerJurisdiction === 'Australia Japan' && !['AU', 'JP'].includes(notice.jurisdictionCode)) return false;
      if (headerJurisdiction === 'UK US Global' && !['UK_EU', 'US', 'GLOBAL'].includes(notice.jurisdictionCode)) return false;

      // Severity check
      if (selectedSeverities.length > 0 && !selectedSeverities.includes(notice.severity)) {
        return false;
      }

      // Jurisdiction check
      if (!selectedJurisdictions[notice.jurisdictionCode]) {
        return false;
      }

      // Sector check: shown if any of its sectors is selected
      if (!(notice.sectors ?? [notice.sector]).some(s => selectedSectors[s])) {
        return false;
      }

      // Format check
      if (selectedFormat && notice.format !== selectedFormat) {
        return false;
      }

      if (onlyNew && (notice.archived || !isNewNotice(notice.id))) {
        return false;
      }

      // Search: every word must appear, at the start of a word, in the title,
      // reference, regulator, tags, summary or key points. Notices the history
      // search found (which also matches word forms) are kept.
      if (highlightTerms.length > 0 && !archiveMatchIds.has(notice.id)) {
        const text = [
          notice.title, notice.ref, notice.regulator, ...notice.tags, notice.summary,
          ...(notice.keyPoints?.points || []), ...(notice.keyPoints?.facts.map(f => f.text) || [])
        ].join(' ');
        if (!highlightTerms.every(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text))) {
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
    searchableNotices,
    archiveMatchIds,
    highlightTerms,
    headerJurisdiction,
    selectedSeverities,
    selectedJurisdictions,
    selectedSectors,
    selectedFormat,
    sortBy,
    onlyNew
  ]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredNotices.length / itemsPerPage));
  const currentNotices = filteredNotices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const deadlines = useMemo(() => deriveDeadlines(notices), [notices]);
  const notifications = useMemo(() => deriveNotifications(notices), [notices]);
  const latestNotices = useMemo(() => sortNewestFirst(notices).slice(0, 5), [notices]);

  const handleSelectNoticeById = (id: string) => {
    setActiveTab('feed');
    const target = searchableNotices.find(n => n.id === id);
    if (target) {
      setActiveNoticeForDossier(target);
    }
  };

  // A linked consultation or conclusion: open it here if loaded, else at the source
  const handleOpenRelated = (id: string, url?: string) => {
    const target = searchableNotices.find(n => n.id === id);
    if (target) setActiveNoticeForDossier(target);
    else if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  // Open a notice named in the URL once it has loaded
  React.useEffect(() => {
    if (!pendingNoticeId || notices.length === 0) return;
    const target = notices.find(n => n.id === pendingNoticeId);
    if (target) setActiveNoticeForDossier(target);
    else showToast('The linked notice is no longer in the feed');
    setPendingNoticeId(null);
  }, [notices, pendingNoticeId]);

  // Keep the URL in step with the view, so it can be shared or bookmarked
  React.useEffect(() => {
    const query = serializeViewState({
      tab: activeTab,
      search: searchQuery,
      keyword: feedKeywordSearch,
      severities: selectedSeverities,
      jurisdictions: selectedJurisdictions,
      sectors: selectedSectors,
      format: selectedFormat,
      sort: sortBy,
      onlyNew,
      noticeId: activeNoticeForDossier?.id ?? pendingNoticeId
    });
    if (query !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`);
    }
  }, [activeTab, searchQuery, feedKeywordSearch, selectedSeverities, selectedJurisdictions, selectedSectors, selectedFormat, sortBy, onlyNew, activeNoticeForDossier, pendingNoticeId]);

  const upcomingDates = useMemo(() => calendarNotices(notices), [notices]);
  const liquidityNotice = notices.find(n => n.id.startsWith('hkma-liquidity'));

  const filterSidebarProps = {
    selectedSeverities,
    onToggleSeverity: handleToggleSeverity,
    selectedJurisdictions,
    onToggleJurisdiction: handleToggleJurisdiction,
    selectedSectors,
    onToggleSector: handleToggleSector,
    selectedFormat,
    onSelectFormat: (fmt: string | null) => {
      setSelectedFormat(fmt);
      setCurrentPage(1);
    },
    onResetFilters: handleResetFilters,
    jurisdictionCounts,
    sectorCounts,
    severityCounts,
    formatCounts,
    endpoints,
    onPingEndpoints: handlePingEndpoints,
    isPinging
  };

  return (
    <div className="bg-page font-['Inter'] text-ink antialiased min-h-screen flex flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
      {/* Fixed Top Header */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded focus:bg-prussian focus:text-on-accent font-['Inter'] text-[13px] font-semibold"
      >
        Skip to the notices
      </a>
      <Header
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          setActiveTab('feed');
          setCurrentPage(1);
        }}
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
        onTriggerSync={syncNow}
        lastSyncTime={lastSyncTime}
        endpoints={endpoints}
      />

      {/* Navigation Sub-bar & Real-Time Wire */}
      <Navigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        wireItems={latestNotices}
        onSelectNotice={handleSelectNoticeById}
      />

      {/* Main Content Viewport */}
      <main id="main" tabIndex={-1} className="focus:outline-none w-full pt-[88px] md:pt-32 bg-page min-h-screen flex-1 flex flex-col">
        {activeTab === 'feed' && (
          <div className="flex flex-col w-full">
            {/* Executive KPI Ribbon */}
            <KpiRibbon
              totalNoticesCount={notices.length}
              criticalCount={notices.filter(n => n.severity === 'critical').length}
              consultationsCount={openConsultationsCount}
              closedConsultationsCount={consultations.length - openConsultationsCount}
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
                <FilterSidebar {...filterSidebarProps} />

                {/* Center Feed (6 cols): Active Notices Feed */}
                <section aria-labelledby="feed-heading" className="lg:col-span-6 flex flex-col gap-3 min-w-0">
                  <h2 id="feed-heading" className="sr-only">Notices</h2>
                  <NextUpStrip
                    nextDeadline={deadlines[0]}
                    liquidity={liquidityNotice}
                    onOpenNotice={handleSelectNoticeById}
                  />

                  {/* Live Feeds Connected Status Strip */}
                  <div className="bg-panel border border-line px-3.5 py-2 rounded-lg flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-cobalt animate-pulse"></span>
                      <span className="font-['JetBrains_Mono'] font-bold text-ink">
                        Automated Feed Ingestion
                      </span>
                      <span className="text-muted hidden sm:inline">•</span>
                      <span className="text-muted hidden sm:inline">
                        {ingestingSources.length > 0 ? ingestingSources.join(', ') : 'Waiting for first sync'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="font-['JetBrains_Mono'] text-[10px] text-muted"
                        title={lastSyncAt ? `The server built this data at ${new Date(lastSyncAt).toLocaleString()}` : undefined}
                      >
                        {lastSyncAt ? `Data as of ${lastSyncTime}` : lastSyncTime}
                        {isSyncing && hasSynced ? ' · refreshing…' : ''}
                      </span>
                      <button
                        onClick={() => setIsEndpointsModalOpen(true)}
                        className="text-prussian hover:text-prussian-deep font-bold text-[11px] flex items-center gap-0.5 cursor-pointer ml-1"
                      >
                        <span>Endpoints Gateway</span>
                        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">open_in_new</span>
                      </button>
                    </div>
                  </div>

                  {/* Offline: the notices are the copy saved on this device */}
                  {hasSynced && (isOffline || savedCopyAt) && (
                    <div role="status" className="bg-ochre-wash border border-ochre-line px-3.5 py-2 rounded-lg flex items-center gap-2 text-[12px] text-ochre">
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">cloud_off</span>
                      <span>
                        {isOffline ? "You're offline. " : 'The feed server could not be reached. '}
                        Showing the notices saved on this device (data as of {lastSyncTime}); they refresh when the connection is back.
                      </span>
                    </div>
                  )}

                  {/* New since the last visit in this browser */}
                  {previousVisit && hasSynced && (
                    <div className="bg-panel border border-line px-3.5 py-2 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[12px] shadow-2xs">
                      <span className="text-ink-soft">
                        {newCount > 0 ? (
                          <>
                            <strong className="text-prussian">{newCount} new</strong> since your last visit
                          </>
                        ) : (
                          'Nothing new since your last visit'
                        )}
                        {previousVisit.at && (
                          <span className="text-muted">
                            {' '}({new Date(previousVisit.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </span>
                      {(newCount > 0 || onlyNew) && (
                        <button
                          onClick={() => {
                            setOnlyNew(v => !v);
                            setCurrentPage(1);
                          }}
                          aria-pressed={onlyNew}
                          className={`min-h-[32px] px-3 rounded font-['Inter'] text-[11px] font-semibold border transition-colors ${
                            onlyNew ? 'bg-prussian text-on-accent border-prussian' : 'bg-panel-raised text-ink border-line hover:bg-wash'
                          }`}
                        >
                          {onlyNew ? 'Show all' : 'Show only new'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Feed Search & Sort Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-panel border border-line p-2.5 rounded-lg shadow-xs">
                    <div className="relative flex-1">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-muted text-lg pointer-events-none" aria-hidden="true">
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
                        aria-label="Filter the feed"
                        className="w-full h-8 pl-9 pr-3 bg-panel-raised border border-line rounded text-ink placeholder:text-muted font-['Inter'] text-[12px] focus:outline-none focus:bg-panel focus:border-prussian transition-all"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setIsFilterDrawerOpen(true)}
                        className="lg:hidden h-9 px-3 flex items-center gap-1 bg-panel-raised border border-line text-ink font-['Inter'] text-[12px] font-semibold rounded"
                      >
                        <span className="material-symbols-outlined text-base text-prussian" aria-hidden="true">filter_alt</span>
                        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                      </button>
                      <span className="font-['JetBrains_Mono'] text-[11px] text-muted hidden md:inline font-medium">
                        Sort:
                      </span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        aria-label="Sort notices"
                        className="h-9 lg:h-8 min-w-0 flex-1 sm:flex-none px-2 bg-panel-raised border border-line text-ink font-['Inter'] text-[11px] font-semibold rounded focus:outline-none focus:border-prussian cursor-pointer"
                      >
                        <option value="Highest Impact Score">Highest Impact Score</option>
                        <option value="Most Recent First">Most Recent First</option>
                        <option value="Consultation Deadline">Consultation Deadline</option>
                      </select>

                      <button
                        onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
                        className={`h-8 w-8 flex items-center justify-center border rounded transition-colors ${
                          density === 'compact'
                            ? 'bg-prussian text-on-accent border-prussian'
                            : 'bg-panel-raised border-line text-ink-soft hover:text-ink'
                        }`}
                        title="Feed Density Toggle"
                        aria-label="Toggle compact view"
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">view_agenda</span>
                      </button>

                      <button
                        onClick={handleCopyViewLink}
                        className="h-8 w-8 flex items-center justify-center border rounded bg-panel-raised border-line text-ink-soft hover:text-ink transition-colors"
                        title="Copy a link to this view, with its filters and search"
                        aria-label="Copy a link to this view"
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">share</span>
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
                          isNew={!notice.archived && isNewNotice(notice.id)}
                          onCopyLink={handleCopyNoticeLink}
                          onAddToCalendar={handleAddToCalendar}
                          highlight={highlightTerms}
                          onOpenRelated={handleOpenRelated}
                        />
                      ))
                    ) : !hasSynced && syncError ? (
                      <div className="bg-panel border border-ochre-line rounded-lg p-8 text-center space-y-2 shadow-xs">
                        <span className="material-symbols-outlined text-3xl text-ochre" aria-hidden="true">cloud_off</span>
                        <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink">
                          Live notices could not be loaded
                        </h4>
                        <p className="text-[12px] text-ink-soft">
                          {syncError} RegSonar shows no sample data, so the feed stays empty until a sync succeeds.
                        </p>
                        <button
                          onClick={syncNow}
                          disabled={isSyncing}
                          className="mt-1 px-3 py-1.5 bg-prussian hover:bg-prussian-deep text-on-accent text-[12px] font-semibold rounded disabled:opacity-60"
                        >
                          {isSyncing ? 'Retrying...' : 'Retry sync'}
                        </button>
                      </div>
                    ) : !hasSynced ? (
                      <div className="bg-panel border border-line rounded-lg p-8 text-center space-y-2 shadow-xs">
                        <span className="material-symbols-outlined text-3xl text-prussian animate-spin" aria-hidden="true">sync</span>
                        <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink">
                          Loading live notices from regulators...
                        </h4>
                        <p className="text-[12px] text-ink-soft">
                          The first sync fetches each source document, so it can take a few seconds.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-panel border border-line rounded-lg p-8 text-center space-y-2 shadow-xs">
                        <span className="material-symbols-outlined text-3xl text-muted" aria-hidden="true">find_in_page</span>
                        <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink">
                          No statutory publications match current filters
                        </h4>
                        <p className="text-[12px] text-ink-soft">
                          Try adjusting your jurisdiction selections or reset the filter facets.
                        </p>
                        <button
                          onClick={handleResetFilters}
                          className="px-3.5 py-1.5 bg-prussian text-on-accent text-[12px] font-semibold rounded hover:bg-prussian-deep transition-colors mt-2 shadow-xs"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pagination Ribbon */}
                  <div className="p-3 bg-panel border border-line rounded-lg flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-soft shadow-xs">
                    <span>
                      Showing {Math.min(filteredNotices.length, (currentPage - 1) * itemsPerPage + 1)} to{' '}
                      {Math.min(filteredNotices.length, currentPage * itemsPerPage)} of{' '}
                      {filteredNotices.length} notices
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`px-3 min-h-9 sm:min-h-0 sm:py-1 rounded text-[11px] font-semibold transition-colors ${
                          currentPage === 1
                            ? 'bg-wash text-muted cursor-not-allowed border border-line'
                            : 'bg-panel-raised text-ink border border-line hover:bg-wash'
                        }`}
                      >
                        Previous
                      </button>

                      <span className="sm:hidden px-1 font-['JetBrains_Mono'] text-[11px]">
                        Page {currentPage} of {totalPages}
                      </span>
                      {Array.from({ length: totalPages }).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentPage(idx + 1)}
                          className={`hidden sm:inline-block px-3 py-1 rounded font-['Inter'] text-[11px] font-semibold transition-colors ${
                            currentPage === idx + 1
                              ? 'bg-prussian text-on-accent shadow-2xs'
                              : 'bg-panel-raised border border-line text-ink hover:bg-wash'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`px-3 min-h-9 sm:min-h-0 sm:py-1 rounded text-[11px] font-semibold transition-colors ${
                          currentPage === totalPages
                            ? 'bg-wash text-muted cursor-not-allowed border border-line'
                            : 'bg-panel-raised text-ink border border-line hover:bg-wash'
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
                  onTriggerSync={syncNow}
                  isSyncing={isSyncing}
                  endpoints={endpoints}
                  calendarCount={upcomingDates.length}
                  onExportCalendar={() => downloadIcs(upcomingDates, 'RegSonar_dates.ics')}
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
            body: 'Live notices are pulled from public sources: the US Federal Register API (SEC, CFTC), the HKMA press release, circular and consultation RSS feeds, the SFC press release, circular and consultation RSS feeds, the HKEX regulatory announcements RSS feed, the MAS website search API (media releases, consultations with the closing date MAS publishes, circulars and guidelines), ASIC media releases (from the JSON file behind the ASIC newsroom page, as ASIC publishes no RSS feed), the JFSA English news RSS feed (press conference transcripts and the weekly newsletter are left out), exchange regulators (SGX RegCo consultations with the closing date SGX publishes, disciplinary actions and regulatory announcements, read from the content API behind the SGX RegCo website; ASX public consultations from the ASX consultations page; rule revisions of the Tokyo Stock Exchange, Osaka Exchange, Tokyo Commodity Exchange and Japan Exchange Regulation from the JPX rule revision pages; FINRA regulatory and information notices from its RSS feed), Bank Negara Malaysia press releases (from the table on its press release page for each year; its RSS feed is behind a Cloudflare check that automated requests cannot pass), Securities Commission Malaysia media releases (from the list in its media release page; Bursa Malaysia is not included because its site sits behind the same kind of check), the BIS media releases RSS feed, and the FSB publications RSS feed. EU coverage comes from the ESMA news RSS feed. UK coverage comes from the Bank of England PRA publications RSS feed and the UK FCA RSS feed (the FCA feed is sometimes blocked by a Cloudflare bot check). HKMA daily liquidity figures are read from the HKMA Daily Monetary Statistics page, because the firewall on the HKMA Open API blocks cloud servers. Each source is fetched at most once every 10 minutes (the HKMA liquidity page every 30 minutes). To load quickly, the page may first show a copy of the last sync kept by the hosting CDN; the time it was built is shown as "Data as of", and a copy older than 10 minutes is refreshed straight away. For HKMA circulars and consultations, key points are quoted from the PDF document. Scanned PDFs are read on the server with Tesseract OCR (first 4 pages, bundled English data); OCR uses a neural text recogniser and can misread characters, so those key points are labelled "OCR". Key points are extractive: the server fetches each official document once and quotes its most central sentences verbatim, ranked with TextRank, alongside dated sentences and reference numbers found by rules. Sentences are selected by TextRank, not an AI model, and no external API is used, so nothing is paraphrased. Impact scores follow one fixed rubric for every source: what the document does (routine releases 3, SEC filings by exchanges 4, other announcements 5, technical standards 6, guidance 6.5, enforcement and open consultations 7, rules made 7.5), plus 1.5 when comments close within 14 days or rules take effect within 30 days; a consultation whose closing date has passed scores 4. Critical (8.5 and up) therefore means a date close at hand. Each notice’s "Why these tags and score?" shows the steps. The score is not a legal assessment or a measure of how much a notice matters to a particular firm. Sectors and formats come from keyword rules, not an AI model: whole words only, with a word in the title counting more than one in the summary, and up to three sectors per notice. Each notice’s "Why these tags?" shows the words that gave each tag, or says the tag is a default because no topic words matched. The rules are tested against a set of hand-labelled notices. Every notice shown comes from a live source; there is no sample data. "New" markers compare against the notices this browser saw before, stored only in this browser. Calendar files (.ics) contain the dates as stated in the source documents. Dates come from the data the source itself publishes where there is any (Federal Register, MAS, SGX) and otherwise from a sentence in the document that states a date for the document itself, labelled by kind: "Comments close" (a request for comments, or on a consultation a statement of when it closes), "Takes effect" or "Comply by". The date must follow its cue directly, sentences about proposals or conditions give no effective date, and digests and enforcement actions take no dates from their text, because those dates usually belong to other papers or people. The sentence a date comes from is shown with the notice. When the server has a history database, every notice read is stored there: the feed also shows the last 30 days from it (marked "From history"), and search covers the whole history. A consultation and its conclusions are linked by regulator and title words ("matched by title"), because regulators do not publish that link in a form that can be read automatically.'
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

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Filters sheet (phones and tablets) */}
      {isFilterDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex">
          <button className="flex-1 bg-black/40" aria-label="Close filters" tabIndex={-1} onClick={() => setIsFilterDrawerOpen(false)}></button>
          <div ref={filterDrawerRef} role="dialog" aria-modal="true" aria-label="Filters" tabIndex={-1} className="w-[min(360px,90vw)] h-full bg-page shadow-2xl flex flex-col focus:outline-none">
            <div className="flex items-center justify-between px-4 h-14 border-b border-line bg-panel">
              <span className="font-['Hanken_Grotesk'] text-[17px] font-bold">Filters</span>
              <button
                onClick={() => setIsFilterDrawerOpen(false)}
                className="h-9 px-3 bg-prussian text-on-accent rounded font-['Inter'] text-[12px] font-semibold"
              >
                Show {filteredNotices.length} {filteredNotices.length === 1 ? 'notice' : 'notices'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <FilterSidebar {...filterSidebarProps} variant="drawer" />
            </div>
          </div>
        </div>
      )}

      {/* Short confirmation messages */}
      <div aria-live="polite" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-6 z-[70] pointer-events-none">
        {toast && (
          <div className="px-4 py-2 rounded-lg bg-ink text-on-accent font-['Inter'] text-[12px] shadow-lg">{toast}</div>
        )}
      </div>

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
        onSyncAll={syncNow}
        isSyncing={isSyncing}
        isPinging={isPinging}
        lastSyncTime={lastSyncTime}
        autoSyncInterval={autoSyncInterval}
        onChangeAutoSyncInterval={setAutoSyncInterval}
      />

      {/* Info Notice Modal */}
      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div ref={infoDialogRef} role="dialog" aria-modal="true" aria-labelledby="info-title" tabIndex={-1} className="bg-panel border border-line-strong rounded-xl w-full max-w-lg shadow-2xl p-5 space-y-3 focus:outline-none">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 id="info-title" className="font-['Hanken_Grotesk'] text-[17px] font-bold text-ink">
                {infoModal.title}
              </h3>
              <button
                onClick={() => setInfoModal(null)}
                aria-label="Close"
                className="text-muted hover:text-ink"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
              </button>
            </div>
            <p className="text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap font-['Inter']">
              {infoModal.body}
            </p>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInfoModal(null)}
                className="px-4 py-1.5 bg-prussian text-on-accent text-[12px] font-semibold rounded hover:bg-prussian-deep shadow-xs"
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

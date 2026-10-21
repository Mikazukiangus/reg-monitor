import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { FilterSidebar } from './components/FilterSidebar';
import { Footer } from './components/Footer';
import { BottomNav } from './components/BottomNav';
import { MonitoringControls } from './components/MonitoringControls';
import { useDialog } from './components/useDialog';

// Screens
import { FeedScreen } from './components/screens/FeedScreen';
import { RadarScreen } from './components/screens/RadarScreen';
import { HorizonScreen } from './components/screens/HorizonScreen';
import { EnforcementScreen } from './components/screens/EnforcementScreen';
import { AlertRulesScreen } from './components/screens/AlertRulesScreen';

// Modals
import { GapAnalysisModal } from './components/modals/GapAnalysisModal';
import { PdfDossierModal } from './components/modals/PdfDossierModal';
import { ExportModal } from './components/modals/ExportModal';
import { LiveEndpointsModal } from './components/modals/LiveEndpointsModal';

import { deriveDeadlines, deriveNotifications, sortNewestFirst } from '../shared/derived';
import { buildIcs, calendarNotices } from './lib/ics';
import { FILE_TYPES, saveFile } from './lib/download';
import { copyText, noticeLink, parseViewState, serializeViewState, type HeaderJurisdiction, type ViewState } from './lib/urlState';
import { readPreviousVisit } from './lib/visits';
import { countFacets, filterNotices } from './lib/feedFilter';
import { useToast } from './hooks/useToast';
import { useFeedSync } from './hooks/useFeedSync';
import { useFeedFilters } from './hooks/useFeedFilters';
import { usePagination } from './hooks/usePagination';
import { useBookmarks } from './hooks/useBookmarks';
import { useHistorySearch, useLinkedNotice } from './hooks/useHistorySearch';
import { RegulatoryNotice } from '../shared/regulatory';

export default function App() {
  // The view in the URL when the page opened (a shared link, or a reload)
  const [initialView] = useState(() => parseViewState(window.location.search));
  // Notices this browser had seen before this page load; null on a first visit
  const [previousVisit] = useState(() => readPreviousVisit());

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialView.tab);
  const { toast, showToast } = useToast();

  // Live notices, source status and background refreshes
  const sync = useFeedSync(showToast);
  const { notices, archive, hasSynced, endpoints, isSyncing, isPinging, lastSyncTime, syncNow } = sync;

  // Filters, search and sort, starting from the URL
  const filters = useFeedFilters(initialView);
  const {
    headerJurisdiction, selectedSeverities, selectedJurisdictions, selectedSectors, selectedFormat,
    sortBy, onlyNew, dateFrom, dateTo, onlySaved, searchText, searchPatterns
  } = filters;

  const [isEndpointsModalOpen, setIsEndpointsModalOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Active Modals
  const [activeNoticeForGap, setActiveNoticeForGap] = useState<RegulatoryNotice | null>(null);
  const [activeNoticeForDossier, setActiveNoticeForDossier] = useState<RegulatoryNotice | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);
  const infoDialogRef = useDialog<HTMLDivElement>(!!infoModal, () => setInfoModal(null));
  const filterDrawerRef = useDialog<HTMLDivElement>(isFilterDrawerOpen, () => setIsFilterDrawerOpen(false));

  // Bookmarks, older notices the history search found, and a notice named in the URL
  const { savedNotices, bookmarkedIds, toggleBookmark } = useBookmarks({ notices, hasSynced, onlySaved, onMessage: showToast });
  const { historyMatches, historyMatchIds } = useHistorySearch(searchText, archive);
  const { pendingNoticeId, setPendingNoticeId } = useLinkedNotice(initialView.noticeId, {
    notices, savedNotices, hasSynced, onFound: setActiveNoticeForDossier, onMessage: showToast
  });

  const handleCopyNoticeLink = async (notice: RegulatoryNotice) => {
    const ok = await copyText(noticeLink(notice.id));
    showToast(ok ? 'Link to this notice copied' : 'Could not copy; the link is in the address bar when the notice is open');
  };

  const handleCopyViewLink = async () => {
    const ok = await copyText(window.location.href);
    showToast(ok ? 'Link to this view copied' : 'Could not copy; use the address bar link');
  };

  const handleAddToCalendar = (notice: RegulatoryNotice) =>
    saveFile(`RegSonar_${notice.id}.ics`, buildIcs([notice]), FILE_TYPES.calendar);

  const handleToggleBookmark = (id: string) => toggleBookmark(id, searchableNotices, activeNoticeForDossier);

  const handleOpenExport = (format: 'csv' | 'json') => {
    setExportFormat(format);
    setIsExportModalOpen(true);
  };

  const facets = useMemo(() => countFacets(notices), [notices]);

  // Notices from the stored history are older ones, so they never count as new
  const isNewNotice = (id: string) => !!previousVisit && !previousVisit.seenIds.has(id);

  // Notices loaded with the feed, plus older ones the history search found
  const searchableNotices = useMemo(() => {
    const combined = [...notices, ...historyMatches];
    const ids = new Set(combined.map(n => n.id));
    if (onlySaved) combined.push(...savedNotices.filter(n => !ids.has(n.id)).map(n => ({ ...n, savedCopy: true })));
    return [...new Map(combined.map(n => [n.id, n])).values()];
  }, [notices, historyMatches, onlySaved, savedNotices]);

  // Filter Notices
  const filteredNotices = useMemo(() => filterNotices(
    searchableNotices,
    {
      headerJurisdiction, severities: selectedSeverities, jurisdictions: selectedJurisdictions, sectors: selectedSectors,
      format: selectedFormat, sort: sortBy, onlyNew, onlySaved, dateFrom, dateTo
    },
    { isNew: isNewNotice, bookmarkedIds, archiveMatchIds: historyMatchIds, searchPatterns }
  ), [
    searchableNotices,
    historyMatchIds,
    searchPatterns,
    headerJurisdiction,
    selectedSeverities,
    selectedJurisdictions,
    selectedSectors,
    selectedFormat,
    sortBy,
    onlyNew, dateFrom, dateTo, onlySaved, bookmarkedIds
  ]);

  const pagination = usePagination(filteredNotices, filters.currentPage, filters.setCurrentPage);

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

  // The open notice's place in the feed as filtered; stepping also turns the
  // feed's page, so the list behind the panel follows
  const dossierIndex = activeTab === 'feed' && activeNoticeForDossier
    ? filteredNotices.findIndex(n => n.id === activeNoticeForDossier.id)
    : -1;
  const stepDossier = (delta: -1 | 1) => {
    const next = filteredNotices[dossierIndex + delta];
    if (dossierIndex < 0 || !next) return;
    setActiveNoticeForDossier(next);
    filters.setCurrentPage(Math.floor((dossierIndex + delta) / pagination.itemsPerPage) + 1);
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

  const view: ViewState = {
    tab: activeTab, ...filters.viewFields,
    noticeId: activeNoticeForDossier?.id ?? pendingNoticeId
  };
  const viewQuery = serializeViewState(view);
  const applySavedView = (query: string) => {
    const next = parseViewState(query);
    setActiveTab(next.tab);
    filters.applyView(next);
    setActiveNoticeForDossier(null); setPendingNoticeId(null);
  };
  React.useEffect(() => {
    if (viewQuery !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${viewQuery}${window.location.hash}`);
  }, [viewQuery]);

  const upcomingDates = useMemo(() => calendarNotices(notices), [notices]);

  const filterSidebarProps = {
    selectedSeverities,
    onToggleSeverity: filters.toggleSeverity,
    selectedJurisdictions,
    onToggleJurisdiction: filters.toggleJurisdiction,
    selectedSectors,
    onToggleSector: filters.toggleSector,
    selectedFormat,
    onSelectFormat: filters.selectFormat,
    onResetFilters: filters.resetFilters,
    jurisdictionCounts: facets.jurisdiction,
    sectorCounts: facets.sector,
    severityCounts: facets.severity,
    formatCounts: facets.format,
    endpoints,
    onPingEndpoints: sync.pingEndpoints,
    isPinging
  };

  const monitoringControlsProps = {
    query: serializeViewState({ ...view, noticeId: null }),
    dateFrom, dateTo, onDates: (from: string, to: string) => { filters.setDateFrom(from); filters.setDateTo(to); },
    onlySaved, savedCount: bookmarkedIds.size, onToggleSaved: () => filters.setOnlySaved(v => !v),
    onApply: applySavedView, onMessage: showToast
  };

  return (
    <div className="bg-page font-['Inter'] text-ink antialiased min-h-screen flex flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
      {/* Fixed Top Header */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded focus:bg-accent focus:text-on-accent font-['Inter'] text-[13px] font-semibold"
      >
        Skip to the notices
      </a>
      <Header
        searchQuery={filters.searchQuery}
        onSearchChange={(value) => {
          filters.setSearchQuery(value);
          setActiveTab('feed');
          filters.setCurrentPage(1);
        }}
        selectedJurisdictionFilter={headerJurisdiction}
        onJurisdictionFilterChange={value => filters.setHeaderJurisdiction(value as HeaderJurisdiction)}
        onOpenExport={() => handleOpenExport('csv')}
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
      <main id="main" tabIndex={-1} className="focus:outline-none w-full pt-14 md:pt-32 bg-page min-h-screen flex-1 flex flex-col">
        {activeTab === 'feed' && (
          <FeedScreen
            notices={notices}
            sync={sync}
            filters={filters}
            pagination={pagination}
            filteredNotices={filteredNotices}
            previousVisit={previousVisit}
            isNewNotice={isNewNotice}
            bookmarkedIds={bookmarkedIds}
            deadlines={deadlines}
            upcomingDates={upcomingDates}
            filterSidebarProps={filterSidebarProps}
            monitoringControlsProps={monitoringControlsProps}
            onOpenFilters={() => setIsFilterDrawerOpen(true)}
            onOpenEndpoints={() => setIsEndpointsModalOpen(true)}
            onOpenExport={handleOpenExport}
            onSelectNoticeById={handleSelectNoticeById}
            onOpenNotice={n => setActiveNoticeForDossier(n)}
            onOpenGapAnalysis={n => setActiveNoticeForGap(n)}
            onToggleBookmark={handleToggleBookmark}
            onCopyNoticeLink={handleCopyNoticeLink}
            onAddToCalendar={handleAddToCalendar}
            onOpenRelated={handleOpenRelated}
            onCopyViewLink={handleCopyViewLink}
          />
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
            body: 'Live notices are pulled from public sources: the US Federal Register API (SEC, CFTC), the HKMA press release, circular and consultation RSS feeds, the SFC press release, circular and consultation RSS feeds, the HKEX regulatory announcements RSS feed, the MAS website search API (media releases, consultations with the closing date MAS publishes, circulars and guidelines), ASIC media releases (from the JSON file behind the ASIC newsroom page, as ASIC publishes no RSS feed), the JFSA English news RSS feed (press conference transcripts and the weekly newsletter are left out), exchange regulators (SGX RegCo consultations with the closing date SGX publishes, disciplinary actions and regulatory announcements, read from the content API behind the SGX RegCo website; ASX public consultations from the ASX consultations page; rule revisions of the Tokyo Stock Exchange, Osaka Exchange, Tokyo Commodity Exchange and Japan Exchange Regulation from the JPX rule revision pages; FINRA regulatory and information notices from its RSS feed), Bank Negara Malaysia press releases (from the table on its press release page for each year; its RSS feed is behind a Cloudflare check that automated requests cannot pass), Securities Commission Malaysia media releases (from the list in its media release page; Bursa Malaysia is not included because its site sits behind the same kind of check), the BIS media releases RSS feed, and the FSB publications RSS feed. EU coverage comes from the ESMA news RSS feed and, for Germany, BaFin’s English news and measures-and-sanctions RSS feeds (warnings to consumers about unauthorised websites and officials’ calendars are left out). India coverage comes from the Reserve Bank of India’s notifications and press release RSS feeds (daily market operations and auctions are left out) and SEBI’s RSS feed (appeals filed by individuals and recovery proceedings are left out). UK coverage comes from the Bank of England PRA publications RSS feed and the UK FCA RSS feed (the FCA feed is sometimes blocked by a Cloudflare bot check). Rules for artificial intelligence come from the official source in each jurisdiction that makes or enforces them: the European Commission’s AI news (the AI Act), GOV.UK for the UK’s Department for Science, Innovation and Technology and AI Security Institute, Federal Register documents whose title is about AI (executive orders, rules and requests for information from any US agency), FTC press releases, the California Governor’s office and California’s privacy regulator (CalPrivacy, which makes the rules on automated decisionmaking), the Colorado Attorney General, South Korea’s Ministry of Science and ICT (the Framework Act on AI), the State Council’s policy library on gov.cn for China (rules and policy documents of the State Council and its departments, including the Cyberspace Administration, in Chinese; the Cyberspace Administration’s own site does not accept connections from the hosting region) and the AI strategy pages of Japan’s Cabinet Office (in Japanese). Feeds that cover all of an agency’s work are narrowed to items whose title is about AI and that concern rules or their enforcement, so some of these sources often have nothing new. Chinese and Japanese titles and key points are shown as published, not translated. Texas is not covered: its AI law is enforced by the Texas Attorney General, whose news releases rarely concern AI. Each source is fetched at most once every 10 minutes. To load quickly, the page may first show a copy of the last sync kept by the hosting CDN; the time it was built is shown as "Data as of", and a copy older than 10 minutes is refreshed straight away. For HKMA circulars and consultations, key points are quoted from the PDF document. Scanned PDFs are read on the server with Tesseract OCR (first 4 pages, bundled English data); OCR uses a neural text recogniser and can misread characters, so those key points are labelled "OCR". Key points are extractive: the server fetches each official document once and quotes its most central sentences verbatim, ranked with TextRank, alongside dated sentences and reference numbers found by rules. Sentences are selected by TextRank, not an AI model, and no external API is used, so nothing is paraphrased. Impact scores follow one fixed rubric for every source: what the document does (routine releases 3, SEC filings by exchanges 4, other announcements 5, technical standards 6, guidance 6.5, enforcement and open consultations 7, rules made 7.5), plus 1.5 when comments close within 14 days or rules take effect within 30 days; a consultation whose closing date has passed scores 4. Critical (8.5 and up) therefore means a date close at hand. Each notice’s "Why these tags and score?" shows the steps. The score is not a legal assessment or a measure of how much a notice matters to a particular firm. Sectors and formats come from keyword rules, not an AI model: whole words only, with a word in the title counting more than one in the summary, and up to three sectors per notice. Each notice’s "Why these tags?" shows the words that gave each tag, or says the tag is a default because no topic words matched. The rules are tested against a set of hand-labelled notices. Every notice shown comes from a live source; there is no sample data. "New" markers compare against the notices this browser saw before, stored only in this browser. Calendar files (.ics) contain the dates as stated in the source documents. Dates come from the data the source itself publishes where there is any (Federal Register, MAS, SGX) and otherwise from a sentence in the document that states a date for the document itself, labelled by kind: "Comments close" (a request for comments, or on a consultation a statement of when it closes), "Takes effect" or "Comply by". The date must follow its cue directly, sentences about proposals or conditions give no effective date, and digests and enforcement actions take no dates from their text, because those dates usually belong to other papers or people. The sentence a date comes from is shown with the notice. When the server has a history database, every notice read is stored there: the feed also shows the last 30 days from it (marked "From history"), and search covers the whole history. A consultation and its conclusions are linked by regulator and title words ("matched by title"), because regulators do not publish that link in a form that can be read automatically.'
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
                className="h-9 px-3 bg-accent text-on-accent rounded font-['Inter'] text-[12px] font-semibold"
              >
                Show {filteredNotices.length} {filteredNotices.length === 1 ? 'notice' : 'notices'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <FilterSidebar {...filterSidebarProps} variant="drawer" />
              <div className="mt-3">
                <MonitoringControls {...monitoringControlsProps} />
              </div>
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
        position={dossierIndex >= 0 ? { index: dossierIndex, total: filteredNotices.length } : undefined}
        onStep={stepDossier}
        isBookmarked={!!activeNoticeForDossier && bookmarkedIds.has(activeNoticeForDossier.id)}
        onToggleBookmark={handleToggleBookmark}
        onOpenGapAnalysis={n => { setActiveNoticeForDossier(null); setActiveNoticeForGap(n); }}
        onCopyLink={handleCopyNoticeLink}
        onOpenRelated={handleOpenRelated}
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
        onPingAll={sync.pingEndpoints}
        onSyncAll={syncNow}
        isSyncing={isSyncing}
        isPinging={isPinging}
        lastSyncTime={lastSyncTime}
        autoSyncInterval={sync.autoSyncInterval}
        onChangeAutoSyncInterval={sync.setAutoSyncInterval}
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
                className="px-4 py-1.5 bg-accent text-on-accent text-[12px] font-semibold rounded hover:bg-accent-deep shadow-xs"
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

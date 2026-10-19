// The Live Regulatory Feed tab: headline figures, filters, the notices (cards
// or a list) with their status strips and pages, and upcoming dates
import React from 'react';
import { KpiRibbon } from '../KpiRibbon';
import { FilterSidebar } from '../FilterSidebar';
import { NoticeCard } from '../NoticeCard';
import { NoticeList } from '../NoticeList';
import { RightSidebar } from '../RightSidebar';
import { NextUpStrip } from '../NextUpStrip';
import { MonitoringControls } from '../MonitoringControls';
import { SourceFreshness } from '../SourceFreshness';
import { paginationPages } from '../../lib/preferences';
import { countNew, feedFigures, ingestingAgencies } from '../../lib/feedStats';
import { buildIcs } from '../../lib/ics';
import { FILE_TYPES, saveFile } from '../../lib/download';
import type { PreviousVisit } from '../../lib/visits';
import type { FeedSync } from '../../hooks/useFeedSync';
import type { FeedFiltersState } from '../../hooks/useFeedFilters';
import type { Pagination } from '../../hooks/usePagination';
import { DeadlineItem, RegulatoryNotice } from '../../types/regulatory';

interface Props {
  notices: RegulatoryNotice[];
  sync: FeedSync;
  filters: FeedFiltersState;
  pagination: Pagination;
  // The notices the filters let through, in order
  filteredNotices: RegulatoryNotice[];
  previousVisit: PreviousVisit | null;
  isNewNotice: (id: string) => boolean;
  bookmarkedIds: Set<string>;
  deadlines: DeadlineItem[];
  upcomingDates: RegulatoryNotice[];
  filterSidebarProps: Omit<React.ComponentProps<typeof FilterSidebar>, 'children' | 'variant'>;
  monitoringControlsProps: React.ComponentProps<typeof MonitoringControls>;
  onOpenFilters: () => void;
  onOpenEndpoints: () => void;
  onOpenExport: (format: 'csv' | 'json') => void;
  onSelectNoticeById: (id: string) => void;
  onOpenNotice: (notice: RegulatoryNotice) => void;
  onOpenGapAnalysis: (notice: RegulatoryNotice) => void;
  onToggleBookmark: (id: string) => void;
  onCopyNoticeLink: (notice: RegulatoryNotice) => void;
  onAddToCalendar: (notice: RegulatoryNotice) => void;
  onOpenRelated: (id: string, url?: string) => void;
  onCopyViewLink: () => void;
}

export function FeedScreen({
  notices, sync, filters, pagination, filteredNotices, previousVisit, isNewNotice, bookmarkedIds, deadlines, upcomingDates,
  filterSidebarProps, monitoringControlsProps, onOpenFilters, onOpenEndpoints, onOpenExport, onSelectNoticeById, onOpenNotice,
  onOpenGapAnalysis, onToggleBookmark, onCopyNoticeLink, onAddToCalendar, onOpenRelated, onCopyViewLink
}: Props) {
  const { endpoints, lastSyncAt, lastSyncTime, isSyncing, hasSynced, syncError, isOffline, savedCopyAt, syncNow } = sync;
  const {
    selectedFormat, selectFormat, setSelectedSeverities, onlyNew, setOnlyNew, setCurrentPage, feedKeywordSearch, setFeedKeywordSearch,
    sortBy, setSortBy, activeFilterCount, resetFilters, highlightTerms
  } = filters;
  const { layout, changeLayout, pageItems: currentNotices, page, totalPages, itemsPerPage } = pagination;

  const figures = feedFigures(notices);
  const ingestingSources = ingestingAgencies(endpoints);
  const newCount = countNew(notices, isNewNotice);

  return (
        <div className="flex flex-col w-full">
          {/* Executive KPI Ribbon */}
          <KpiRibbon
            figures={figures}
            endpoints={endpoints}
            onFilterBySeverity={(sev) => {
              if (sev === 'critical') {
                setSelectedSeverities(['critical']);
              } else {
                setSelectedSeverities(['critical', 'high', 'info']);
              }
            }}
            onFilterByFormat={(fmt) => {
              selectFormat(selectedFormat === fmt ? null : fmt);
            }}
          />

          {/* 3-Column Analytical Grid */}
          <div className="w-full px-4 sm:px-6 py-4 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Rail (3 cols): Filters & Facets + Mesh */}
              <FilterSidebar {...filterSidebarProps}>
                <MonitoringControls {...monitoringControlsProps} />
              </FilterSidebar>

              {/* Center Feed (6 cols): Active Notices Feed */}
              <section aria-labelledby="feed-heading" className="lg:col-span-6 flex flex-col gap-3 min-w-0">
                <h2 id="feed-heading" className="sr-only">Notices</h2>
                <NextUpStrip nextDeadline={deadlines[0]} onOpenNotice={onSelectNoticeById} />

                {/* Live Feeds Connected Status Strip */}
                <div className="bg-panel border border-line px-3.5 py-2 rounded-lg flex max-sm:flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] shadow-2xs">
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 shrink-0 rounded-full bg-green-dot animate-pulse"></span>
                    <span className="max-md:hidden shrink-0 font-['JetBrains_Mono'] font-bold text-ink">
                      Automated Feed Ingestion
                    </span>
                    <span className="text-muted hidden sm:inline">•</span>
                    <span className="text-muted hidden sm:block truncate" title={ingestingSources.join(', ') || undefined}>
                      {ingestingSources.length > 0 ? ingestingSources.join(', ') : 'Waiting for first sync'}
                    </span>
                  </div>

                  <div className="max-md:flex-1 shrink-0 flex items-center gap-2">
                    <span
                      className="font-['JetBrains_Mono'] text-[10px] text-muted"
                      title={lastSyncAt ? `The server built this data at ${new Date(lastSyncAt).toLocaleString()}` : undefined}
                    >
                      {lastSyncAt ? `Data as of ${lastSyncTime}` : lastSyncTime}
                      {isSyncing && hasSynced ? ' · refreshing…' : ''}
                    </span>
                    <button
                      onClick={() => onOpenEndpoints()}
                      className="text-accent hover:text-accent-deep font-bold text-[11px] flex items-center gap-0.5 cursor-pointer ml-1 max-md:ml-auto max-md:min-h-8"
                    >
                      <span className="md:hidden">Sources</span>
                      <span className="max-md:hidden">Endpoints Gateway</span>
                      <span className="material-symbols-outlined text-[13px]" aria-hidden="true">open_in_new</span>
                    </button>
                  </div>
                </div>

                {/* Offline: the notices are the copy saved on this device */}
                {hasSynced && (isOffline || savedCopyAt) && (
                  <div role="status" className="bg-cream-wash border border-cream-line px-3.5 py-2 rounded-lg flex items-center gap-2 text-[12px] text-cream">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">cloud_off</span>
                    <span>
                      {isOffline ? "You're offline. " : 'The feed server could not be reached. '}
                      Showing the notices saved on this device (data as of {lastSyncTime}); they refresh when the connection is back.
                    </span>
                  </div>
                )}

                {/* New since the last visit in this browser */}
                {previousVisit && hasSynced && (
                  // Phones show this only when there is something new
                  <div className={`bg-panel border border-line px-3.5 py-2 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[12px] shadow-2xs ${newCount > 0 || onlyNew ? '' : 'max-md:hidden'}`}>
                    <span className="text-ink-soft">
                      {newCount > 0 ? (
                        <>
                          <strong className="text-accent">{newCount} new</strong> since your last visit
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
                          onlyNew ? 'bg-accent text-on-accent border-accent' : 'bg-panel-raised text-ink border-line hover:bg-wash'
                        }`}
                      >
                        {onlyNew ? 'Show all' : 'Show only new'}
                      </button>
                    )}
                  </div>
                )}

                {/* Phones show the scheduled checks after the notices */}
                <div className="max-md:order-last">
                  <SourceFreshness lastSyncAt={lastSyncAt} />
                </div>

                {/* Show feed controls directly after the KPI cards on phones and tablets. */}
                <div className="order-first lg:order-none flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 bg-panel border border-line p-2.5 rounded-lg shadow-xs">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-2 max-md:top-2.5 text-muted text-lg pointer-events-none" aria-hidden="true">
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
                      className="w-full h-8 max-md:h-10 pl-9 pr-3 bg-panel-raised border border-line rounded text-ink placeholder:text-muted font-['Inter'] text-[12px] max-md:text-[16px] focus:outline-none focus:bg-panel focus:border-accent transition-all"
                    />
                  </div>

                  {/* Phones: Filters, layout and share on one row, sort full width below (16px text) */}
                  <div className="flex max-md:flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onOpenFilters()}
                      className="lg:hidden h-9 px-3 flex items-center gap-1 bg-panel-raised border border-line text-ink font-['Inter'] text-[12px] font-semibold rounded"
                    >
                      <span className="material-symbols-outlined text-base text-accent" aria-hidden="true">filter_alt</span>
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                    <span className="font-['JetBrains_Mono'] text-[11px] text-muted hidden md:max-lg:inline xl:inline font-medium">
                      Sort:
                    </span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      aria-label="Sort notices"
                      className="h-9 lg:h-8 min-w-0 max-md:order-last max-md:basis-full md:flex-none px-2 bg-panel-raised border border-line text-ink font-['Inter'] text-[11px] max-md:text-[16px] font-semibold rounded focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="Highest Impact Score">Highest Impact Score</option>
                      <option value="Most Recent First">Most Recent First</option>
                      <option value="Consultation Deadline">Consultation Deadline</option>
                    </select>

                    <div role="group" aria-label="Layout" className="h-9 lg:h-8 max-md:ml-auto flex border border-line rounded overflow-hidden shrink-0">
                      {([['cards', 'Cards'], ['list', 'List']] as const).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => changeLayout(value)}
                          aria-pressed={layout === value}
                          title={value === 'list' ? 'One line per notice, 20 to a page' : 'Cards with key points, 5 to a page'}
                          className={`px-2 flex items-center gap-1 font-['Inter'] text-[11px] font-semibold transition-colors ${
                            layout === value ? 'bg-accent text-on-accent' : 'bg-panel-raised text-ink-soft hover:text-ink'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">{value === 'list' ? 'view_list' : 'view_agenda'}</span>
                          <span className="max-xl:sr-only">{label}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={onCopyViewLink}
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
                  {currentNotices.length > 0 && layout === 'list' ? (
                    <NoticeList
                      notices={currentNotices}
                      isNew={n => !n.archived && isNewNotice(n.id)}
                      bookmarkedIds={bookmarkedIds}
                      onOpen={n => onOpenNotice(n)}
                      onToggleBookmark={onToggleBookmark}
                      highlight={highlightTerms}
                    />
                  ) : currentNotices.length > 0 ? (
                    currentNotices.map((notice) => (
                      <NoticeCard
                        key={notice.id}
                        notice={notice}
                        onOpenGapAnalysis={(n) => onOpenGapAnalysis(n)}
                        onOpenPdfDossier={(n) => onOpenNotice(n)}
                        onToggleBookmark={onToggleBookmark}
                        isBookmarked={bookmarkedIds.has(notice.id)}
                        isNew={!notice.archived && isNewNotice(notice.id)}
                        onCopyLink={onCopyNoticeLink}
                        onAddToCalendar={onAddToCalendar}
                        highlight={highlightTerms}
                        onOpenRelated={onOpenRelated}
                      />
                    ))
                  ) : !hasSynced && syncError ? (
                    <div className="bg-panel border border-cream-line rounded-lg p-8 text-center space-y-2 shadow-xs">
                      <span className="material-symbols-outlined text-3xl text-cream" aria-hidden="true">cloud_off</span>
                      <h4 className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink">
                        Live notices could not be loaded
                      </h4>
                      <p className="text-[12px] text-ink-soft">
                        {syncError} RegSonar shows no sample data, so the feed stays empty until a sync succeeds.
                      </p>
                      <button
                        onClick={syncNow}
                        disabled={isSyncing}
                        className="mt-1 px-3 py-1.5 bg-accent hover:bg-accent-deep text-on-accent text-[12px] font-semibold rounded disabled:opacity-60"
                      >
                        {isSyncing ? 'Retrying...' : 'Retry sync'}
                      </button>
                    </div>
                  ) : !hasSynced ? (
                    <div className="bg-panel border border-line rounded-lg p-8 text-center space-y-2 shadow-xs">
                      <span className="material-symbols-outlined text-3xl text-accent animate-spin" aria-hidden="true">sync</span>
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
                        onClick={resetFilters}
                        className="px-3.5 py-1.5 bg-accent text-on-accent text-[12px] font-semibold rounded hover:bg-accent-deep transition-colors mt-2 shadow-xs"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}
                </div>

                {/* Pagination Ribbon */}
                <div className="p-3 bg-panel border border-line rounded-lg flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-soft shadow-xs">
                  <span>
                    Showing {Math.min(filteredNotices.length, (page - 1) * itemsPerPage + 1)} to{' '}
                    {Math.min(filteredNotices.length, page * itemsPerPage)} of{' '}
                    {filteredNotices.length} notices
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className={`px-3 min-h-9 sm:min-h-0 sm:py-1 rounded text-[11px] font-semibold transition-colors ${
                        page === 1
                          ? 'bg-wash text-muted cursor-not-allowed border border-line'
                          : 'bg-panel-raised text-ink border border-line hover:bg-wash'
                      }`}
                    >
                      Previous
                    </button>

                    <span className="sm:hidden px-1 font-['JetBrains_Mono'] text-[11px]">
                      Page {page} of {totalPages}
                    </span>
                    {paginationPages(page, totalPages).map((number, idx) => number === 'gap' ? (
                      <span key={`gap-${idx}`} className="hidden sm:inline px-1" aria-hidden="true">…</span>
                    ) : (
                      <button key={number} onClick={() => setCurrentPage(number)} aria-label={`Page ${number}`}
                        aria-current={page === number ? 'page' : undefined}
                        className={`hidden sm:inline-block px-3 py-1 rounded text-[11px] font-semibold ${page === number ? 'bg-accent text-on-accent' : 'bg-panel-raised border border-line text-ink hover:bg-wash'}`}>
                        {number}
                      </button>
                    ))}

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className={`px-3 min-h-9 sm:min-h-0 sm:py-1 rounded text-[11px] font-semibold transition-colors ${
                        page === totalPages
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
                onOpenExportCsv={() => onOpenExport('csv')}
                onOpenExportJson={() => onOpenExport('json')}
                onSelectDeadlineNotice={onSelectNoticeById}
                onOpenLiveEndpointsModal={() => onOpenEndpoints()}
                onTriggerSync={syncNow}
                isSyncing={isSyncing}
                endpoints={endpoints}
                calendarCount={upcomingDates.length}
                onExportCalendar={() => saveFile('RegSonar_dates.ics', buildIcs(upcomingDates), FILE_TYPES.calendar)}
              />
            </div>
          </div>
        </div>
  );
}

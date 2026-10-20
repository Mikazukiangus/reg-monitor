// The feed's filters, search and sort, starting from the view in the URL,
// and the page of the feed shown (back to the first page when they change).
import React, { useMemo, useState } from 'react';
import { createSearchPattern, searchTerms } from '../lib/search';
import { defaultViewState, type HeaderJurisdiction, type SortOption, type ViewState } from '../lib/urlState';
import { JurisdictionCode, SectorDomain, UrgencySeverity } from '../../shared/regulatory';

export function useFeedFilters(initialView: ViewState) {
  // Search & Global Jurisdiction Filter
  const [searchQuery, setSearchQuery] = useState(initialView.search);
  const [feedKeywordSearch, setFeedKeywordSearch] = useState(initialView.keyword);
  const [headerJurisdiction, setHeaderJurisdiction] = useState<HeaderJurisdiction>(initialView.headerJurisdiction);

  // Filter Facets
  const [selectedSeverities, setSelectedSeverities] = useState<UrgencySeverity[]>(initialView.severities);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<Record<JurisdictionCode, boolean>>(initialView.jurisdictions);
  const [selectedSectors, setSelectedSectors] = useState<Record<SectorDomain, boolean>>(initialView.sectors);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(initialView.format);
  const [sortBy, setSortBy] = useState<SortOption>(initialView.sort);
  const [onlyNew, setOnlyNew] = useState(initialView.onlyNew);
  const [dateFrom, setDateFrom] = useState(initialView.dateFrom);
  const [dateTo, setDateTo] = useState(initialView.dateTo);
  const [onlySaved, setOnlySaved] = useState(initialView.onlySaved);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Toggle Filters
  const toggleSeverity = (sev: UrgencySeverity) => {
    setSelectedSeverities(prev =>
      prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev]
    );
    setCurrentPage(1);
  };

  const toggleJurisdiction = (code: JurisdictionCode) => {
    setSelectedJurisdictions(prev => ({ ...prev, [code]: !prev[code] }));
    setCurrentPage(1);
  };

  const toggleSector = (sec: SectorDomain) => {
    setSelectedSectors(prev => ({ ...prev, [sec]: !prev[sec] }));
    setCurrentPage(1);
  };

  const selectFormat = (fmt: string | null) => {
    setSelectedFormat(fmt);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    const defaults = defaultViewState();
    setSelectedSeverities(defaults.severities);
    setSelectedJurisdictions(defaults.jurisdictions);
    setSelectedSectors(defaults.sectors);
    setSelectedFormat(null);
    setOnlyNew(false);
    setSearchQuery('');
    setFeedKeywordSearch('');
    setHeaderJurisdiction('All');
    setDateFrom('');
    setDateTo('');
    setOnlySaved(false);
    setCurrentPage(1);
  };

  // The filters of a saved view or shared link (the tab and open notice are the caller's)
  const applyView = (next: ViewState) => {
    setSearchQuery(next.search); setFeedKeywordSearch(next.keyword);
    setSelectedSeverities(next.severities); setSelectedJurisdictions(next.jurisdictions); setSelectedSectors(next.sectors);
    setSelectedFormat(next.format); setSortBy(next.sort); setOnlyNew(next.onlyNew);
    setHeaderJurisdiction(next.headerJurisdiction); setDateFrom(next.dateFrom); setDateTo(next.dateTo); setOnlySaved(next.onlySaved);
    setCurrentPage(1);
  };

  const activeFilterCount =
    (selectedSeverities.length < 3 ? 1 : 0) +
    Object.values(selectedJurisdictions).filter(v => !v).length +
    Object.values(selectedSectors).filter(v => !v).length +
    (selectedFormat ? 1 : 0) +
    (onlyNew ? 1 : 0) + (headerJurisdiction !== 'All' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (onlySaved ? 1 : 0);

  // The header search and the feed's own filter box, searched together
  const searchText = (searchQuery + ' ' + feedKeywordSearch).trim();
  const highlightTerms = useMemo(() => searchTerms(searchText), [searchText]);
  const searchPatterns = useMemo(() => highlightTerms.map(term => createSearchPattern([term])), [highlightTerms]);

  React.useEffect(() => setCurrentPage(1), [searchQuery, feedKeywordSearch, headerJurisdiction, selectedSeverities, selectedJurisdictions, selectedSectors, selectedFormat, sortBy, onlyNew, dateFrom, dateTo, onlySaved]);

  // The filters as they are kept in the URL
  const viewFields: Omit<ViewState, 'tab' | 'noticeId'> = {
    search: searchQuery, keyword: feedKeywordSearch,
    severities: selectedSeverities, jurisdictions: selectedJurisdictions, sectors: selectedSectors,
    format: selectedFormat, sort: sortBy, onlyNew, headerJurisdiction, dateFrom, dateTo, onlySaved
  };

  return {
    searchQuery, setSearchQuery, feedKeywordSearch, setFeedKeywordSearch, headerJurisdiction, setHeaderJurisdiction,
    selectedSeverities, setSelectedSeverities, selectedJurisdictions, selectedSectors, selectedFormat,
    sortBy, setSortBy, onlyNew, setOnlyNew, dateFrom, setDateFrom, dateTo, setDateTo, onlySaved, setOnlySaved,
    currentPage, setCurrentPage,
    toggleSeverity, toggleJurisdiction, toggleSector, selectFormat, resetFilters, applyView,
    activeFilterCount, searchText, highlightTerms, searchPatterns, viewFields
  };
}

export type FeedFiltersState = ReturnType<typeof useFeedFilters>;

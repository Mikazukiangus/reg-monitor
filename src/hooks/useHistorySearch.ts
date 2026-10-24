// Older notices from the stored history that match the search text, asked for
// once the text settles, and a notice named in a shared link, looked up in the
// history when it is not in the feed
import React, { useMemo, useRef, useState } from 'react';
import { noticesById, searchHistory } from '../api/client';
import { RegulatoryNotice } from '../../shared/regulatory';
import { dedupeByDocument } from '../../shared/dedupe';
import type { ArchiveStatus } from './useFeedSync';

export function useHistorySearch(searchText: string, archive: ArchiveStatus, onMessage: (message: string) => void) {
  // Older notices found by searching the history, by search text, and the
  // cursor for the next page of them (null when all have been loaded)
  const [archiveResults, setArchiveResults] = useState<{ query: string; notices: RegulatoryNotice[]; nextCursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRequest = useRef<AbortController | null>(null);

  // Search the stored history as well, once the search text settles
  React.useEffect(() => {
    moreRequest.current?.abort();
    if (!archive.enabled || archive.error || searchText.length < 3) {
      setArchiveResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchHistory(searchText, controller.signal)
        .then(page => setArchiveResults({ query: searchText, ...page }))
        .catch(() => { if (!controller.signal.aborted) onMessage('History search failed; showing matches from the live feed only'); });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, archive.enabled, archive.error]);

  // Only results for the text searched now
  const current = archiveResults && archiveResults.query === searchText ? archiveResults : null;
  const historyMatches = useMemo(() => current?.notices ?? [], [current]);
  const historyMatchIds = useMemo(() => new Set(historyMatches.map(n => n.id)), [historyMatches]);

  // The next page of matches, added to those loaded (copies of one document
  // on different pages are merged, as within a page)
  const loadMoreMatches = () => {
    if (!current?.nextCursor || loadingMore) return;
    const { query, nextCursor } = current;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    searchHistory(query, controller.signal, nextCursor)
      .then(page => setArchiveResults(prev => (prev && prev.query === query
        ? { query, notices: dedupeByDocument([...prev.notices, ...page.notices]), nextCursor: page.nextCursor }
        : prev)))
      .catch(() => { if (!controller.signal.aborted) onMessage('Could not load more history matches'); })
      .finally(() => setLoadingMore(false));
  };

  return { historyMatches, historyMatchIds, moreMatches: !!current?.nextCursor, loadingMore, loadMoreMatches };
}

interface LinkedNoticeOptions {
  notices: RegulatoryNotice[];
  savedNotices: RegulatoryNotice[];
  hasSynced: boolean;
  onFound: (notice: RegulatoryNotice) => void;
  onMessage: (message: string) => void;
}

// A notice named in the URL, opened once the notices have loaded
export function useLinkedNotice(initialId: string | null, { notices, savedNotices, hasSynced, onFound, onMessage }: LinkedNoticeOptions) {
  const [pendingNoticeId, setPendingNoticeId] = useState<string | null>(initialId);

  // Shared links can outlive the latest feed, so try stored history as well.
  React.useEffect(() => {
    if (!pendingNoticeId || !hasSynced) return;
    const target = notices.find(n => n.id === pendingNoticeId) ?? savedNotices.find(n => n.id === pendingNoticeId);
    if (target) { onFound(target); setPendingNoticeId(null); return; }
    const controller = new AbortController();
    noticesById([pendingNoticeId], controller.signal)
      .then(found => {
        const notice = found.find(n => n.id === pendingNoticeId);
        if (notice) onFound(notice);
        else onMessage('This notice was not found in the feed or available history');
        setPendingNoticeId(null);
      }).catch(() => { if (!controller.signal.aborted) onMessage('Could not load the linked notice; the link has been kept for retry'); });
    return () => controller.abort();
  }, [notices, pendingNoticeId, hasSynced, savedNotices]);

  return { pendingNoticeId, setPendingNoticeId };
}

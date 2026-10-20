// Older notices from the stored history that match the search text, asked for
// once the text settles, and a notice named in a shared link, looked up in the
// history when it is not in the feed
import React, { useMemo, useState } from 'react';
import { noticesById, searchHistory } from '../api/client';
import { RegulatoryNotice } from '../../shared/regulatory';
import type { ArchiveStatus } from './useFeedSync';

export function useHistorySearch(searchText: string, archive: ArchiveStatus) {
  // Older notices found by searching the history, by search text
  const [archiveResults, setArchiveResults] = useState<{ query: string; notices: RegulatoryNotice[] } | null>(null);

  // Search the stored history as well, once the search text settles
  React.useEffect(() => {
    if (!archive.enabled || archive.error || searchText.length < 3) {
      setArchiveResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchHistory(searchText, controller.signal)
        .then(found => found && setArchiveResults({ query: searchText, notices: found }))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, archive.enabled, archive.error]);

  // Only results for the text searched now
  const historyMatches = useMemo(
    () => (archiveResults && archiveResults.query === searchText ? archiveResults.notices : []),
    [archiveResults, searchText]
  );
  const historyMatchIds = useMemo(() => new Set(historyMatches.map(n => n.id)), [historyMatches]);
  return { historyMatches, historyMatchIds };
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

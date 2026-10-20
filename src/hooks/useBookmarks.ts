// Notices saved in this browser (up to 200), kept up to date from the feed
// and, while only saved notices are shown, from the history
import React, { useMemo, useState } from 'react';
import { noticesByIdBatches } from '../api/client';
import { readBookmarks, toggleNoticeBookmark, writeBookmarks } from '../lib/preferences';
import { RegulatoryNotice } from '../../shared/regulatory';

interface Options {
  notices: RegulatoryNotice[];
  hasSynced: boolean;
  onlySaved: boolean;
  onMessage: (message: string) => void;
}

export function useBookmarks({ notices, hasSynced, onlySaved, onMessage }: Options) {
  const [savedNotices, setSavedNotices] = useState(readBookmarks);
  const bookmarkedIds = useMemo(() => new Set(savedNotices.map(n => n.id)), [savedNotices]);
  const savedIdKey = JSON.stringify([...bookmarkedIds]);

  // Saving keeps a copy of the notice, found among those loaded or the one open
  const toggleBookmark = (id: string, loaded: RegulatoryNotice[], open: RegulatoryNotice | null) => {
    const next = toggleNoticeBookmark(savedNotices, id, loaded, open);
    if (next.length > 200) { onMessage('Remove a saved notice before adding another (limit 200)'); return; }
    if (!writeBookmarks(next)) { onMessage('This browser could not save your notices'); return; }
    setSavedNotices(next);
  };

  // Refresh saved snapshots from the feed and, when viewing them, from history.
  React.useEffect(() => {
    setSavedNotices(prev => {
      const byId = new Map(notices.map(n => [n.id, n]));
      const next = prev.map(n => byId.get(n.id) ?? n);
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      writeBookmarks(next);
      return next;
    });
  }, [notices]);
  React.useEffect(() => {
    if (!onlySaved || !hasSynced) return;
    const missing = (JSON.parse(savedIdKey) as string[]).filter(id => !notices.some(n => n.id === id));
    if (!missing.length) return;
    const controller = new AbortController();
    const refresh = async () => {
      for await (const found of noticesByIdBatches(missing, controller.signal)) {
        setSavedNotices(prev => {
          const byId = new Map<string, RegulatoryNotice>(found.map(n => [n.id, n]));
          const next = prev.map(n => byId.get(n.id) ?? n);
          writeBookmarks(next); return next;
        });
      }
    };
    refresh().catch(() => { if (!controller.signal.aborted) onMessage('History unavailable; showing saved copies on this device'); });
    return () => controller.abort();
  }, [onlySaved, hasSynced, notices, savedIdKey]);

  return { savedNotices, bookmarkedIds, toggleBookmark };
}

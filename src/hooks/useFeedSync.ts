// The live feed: notices and source status from the feed sync, endpoint
// status checks, background refreshes, and the copy saved on
// this device when offline. There is no sample data.
import React, { useState } from 'react';
import { fetchEndpointStatus, fetchFeed, type ArchiveStatus, type SourceSyncResult } from '../api/client';
import { ENDPOINT_CATALOG } from '../../shared/endpoints';
import { browserLogger } from '../../shared/logging';
import { sgtTime } from '../../shared/derived';
import { recordVisit } from '../lib/visits';
import type { EndpointMetric, RegulatoryNotice } from '../../shared/regulatory';

export type { ArchiveStatus };

// Listed until the first status arrives; the server's reply adds each
// endpoint's address and status
const DEFAULT_ENDPOINTS: EndpointMetric[] = ENDPOINT_CATALOG.map(ep => ({ ...ep, url: '', status: 'Checking' as const, pingMs: null }));

// A cached sync older than this is followed by a fresh one
const STALE_SYNC_MS = 10 * 60 * 1000;

// Combine per-source sync results into one summary per endpoint
export function mergeSyncResults(endpoints: EndpointMetric[], sources: SourceSyncResult[]): EndpointMetric[] {
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

export function useFeedSync(onMessage: (message: string) => void) {
  // Live notices from /api/feeds/sync; there is no sample data
  const [notices, setNotices] = useState<RegulatoryNotice[]>([]);
  // The stored history, when the server has a database
  const [archive, setArchive] = useState<ArchiveStatus>({ enabled: false });
  const [hasSynced, setHasSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Live Endpoints & Ingestion Gateway State
  const [endpoints, setEndpoints] = useState<EndpointMetric[]>(DEFAULT_ENDPOINTS);
  const [isSyncing, setIsSyncing] = useState(false);
  // Set when the notices shown are the copy saved on this device (offline)
  const [savedCopyAt, setSavedCopyAt] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [isPinging, setIsPinging] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('Not synced yet');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [autoSyncInterval, setAutoSyncInterval] = useState(180); // 3 minutes

  // Live Feed Ingestion handlers. A GET may be answered from the CDN cache,
  // so the page fills quickly; force (POST) always fetches fresh data.
  const handleSyncFeeds = async (force = true): Promise<string | null> => {
    setIsSyncing(true);
    try {
      const reply = await fetchFeed(force);
      // The server allows each visitor a few refreshes a minute; the notices shown stay as they are
      if (reply.kind === 'rateLimited') {
        const wait = reply.retryAfter;
        onMessage(`Refreshed several times just now. Try again in ${wait ? `${wait} seconds` : 'a minute'}.`);
        return null;
      }
      // A reply that cannot be read as a feed: the notices shown stay as they are
      if (reply.kind === 'malformed') {
        browserLogger.warn('[RegSonar] Feed reply refused:', reply.problem);
        setSyncError('The feed server sent a reply this page could not read.');
        return null;
      }
      if (reply.kind === 'ok') {
        const { data } = reply;
        if (reply.leftOut.length > 0) {
          browserLogger.warn(`[RegSonar] Left out ${reply.leftOut.length} malformed item(s) of the feed reply:`, reply.leftOut.slice(0, 5));
        }
        if (data.notices) {
          // The server returns the full current live set, so replace rather than append.
          // Offline, it is the copy saved on this device; its sector names were
          // brought up to date when the reply was checked.
          setNotices(data.notices);
          if (data.archive) setArchive(data.archive);
          recordVisit(data.notices.map(n => n.id));
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
        const { savedAt } = reply;
        setSavedCopyAt(savedAt);
        return savedAt ? null : syncedAt;
      }
      setSyncError(`The feed server returned HTTP ${reply.status}.`);
    } catch (err) {
      browserLogger.warn('[RegSonar] Live feed sync note:', err);
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
      const status = await fetchEndpointStatus();
      if (status) {
        // Keep the last sync summary; status probes don't fetch notices
        setEndpoints(prev => status.map(ep => ({ ...ep, sync: prev.find(p => p.id === ep.id)?.sync })));
      }
    } catch (err) {
      browserLogger.warn('[RegSonar] Endpoint ping note:', err);
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

  return {
    notices, archive, hasSynced, syncError, endpoints, isSyncing, savedCopyAt, isOffline, isPinging,
    lastSyncTime, lastSyncAt, autoSyncInterval, setAutoSyncInterval, syncNow, pingEndpoints: handlePingEndpoints
  };
}

export type FeedSync = ReturnType<typeof useFeedSync>;

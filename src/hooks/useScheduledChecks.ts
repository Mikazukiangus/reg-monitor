// The latest scheduled source check, read again after each feed sync
import { useEffect, useState } from 'react';
import { fetchScheduledChecks, type ScheduledChecks } from '../api/client';

export function useScheduledChecks(lastSyncAt: string | null) {
  const [status, setStatus] = useState<ScheduledChecks | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchScheduledChecks(controller.signal)
      .then(data => { setStatus(data); setUnavailable(false); })
      .catch(() => { if (!controller.signal.aborted) { setStatus(null); setUnavailable(true); } });
    return () => controller.abort();
  }, [lastSyncAt]);
  return { status, unavailable };
}

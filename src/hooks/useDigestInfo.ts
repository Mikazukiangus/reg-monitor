// The daily email digest's rules and whether sending is set up, read once
import { useEffect, useState } from 'react';
import { fetchDigestInfo, type DigestInfo } from '../api/client';

export function useDigestInfo() {
  const [digest, setDigest] = useState<DigestInfo | null>(null);
  const [digestError, setDigestError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchDigestInfo(controller.signal)
      .then(setDigest)
      .catch(() => { if (!controller.signal.aborted) setDigestError(true); });
    return () => controller.abort();
  }, []);
  return { digest, digestError };
}

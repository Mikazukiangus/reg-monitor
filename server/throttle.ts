// Limits on work that visitors can trigger. Both are kept in memory, so on a
// serverless host each running instance counts separately.

// Runs build at most once per ttlMs. Calls in between get the last result, and
// calls while a build is running wait for that build.
export function reuseFor<T>(ttlMs: number, build: () => Promise<T>): (now?: number) => Promise<T> {
  let last: { at: number; value: T } | undefined;
  let running: Promise<T> | undefined;
  return (now = Date.now()) => {
    if (last && now - last.at < ttlMs) return Promise.resolve(last.value);
    running ??= build()
      .then(value => {
        last = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  };
}

// Allows each key (a visitor's IP address) `limit` requests per window. Returns
// the seconds to wait when the limit is reached, otherwise 0.
export function rateLimit(limit: number, windowMs: number): (key: string, now?: number) => number {
  const hits = new Map<string, number[]>();
  return (key, now = Date.now()) => {
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    }
    recent.push(now);
    hits.set(key, recent);
    // Forget visitors whose window has passed, so the map stays small
    if (hits.size > 5000) {
      for (const [k, times] of hits) if (now - times[times.length - 1] >= windowMs) hits.delete(k);
    }
    return 0;
  };
}

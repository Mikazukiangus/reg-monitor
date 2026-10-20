// The same document can arrive through two feeds of one regulator (an SFC
// press release that is also listed under Consultations), each with its own
// id. Keep one notice per document link: the consultation copy if there is
// one, carrying over key points from the other copy when it has none.

export interface DedupableNotice {
  id: string;
  format: string;
  dossierUrl?: string;
  keyPoints?: unknown;
}

function documentKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    u.hash = '';
    return (u.host + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch {
    return url;
  }
}

export function dedupeByDocument<T extends DedupableNotice>(notices: T[]): T[] {
  const kept = new Map<string, T>();
  const order: (string | T)[] = [];
  for (const n of notices) {
    const key = documentKey(n.dossierUrl);
    if (!key) {
      order.push(n);
      continue;
    }
    const existing = kept.get(key);
    if (!existing) {
      kept.set(key, n);
      order.push(key);
      continue;
    }
    const [winner, other] =
      n.format === 'Consultations' && existing.format !== 'Consultations' ? [n, existing] : [existing, n];
    kept.set(key, winner.keyPoints || !other.keyPoints ? winner : { ...winner, keyPoints: other.keyPoints });
  }
  return order.map(entry => (typeof entry === 'string' ? kept.get(entry)! : entry));
}

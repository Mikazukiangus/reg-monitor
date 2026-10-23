// Updates that concurrent requests make to shared data: the history database
// (several server instances at once) and this browser's storage (several tabs)
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
const { getDb, saveNotices } = await import('../server/db.ts');
const { openStore, noticeStore, toStored } = await import('../server/store.ts');
const { rebuildDates, saveDates } = await import('../server/dates.ts');
const { relinkAll, linkSaved } = await import('../server/links.ts');
const { readBookmarks, toggleNoticeBookmark, writeBookmarks } = await import('../src/lib/preferences.ts');
type NoticeStore = import('../server/store.ts').NoticeStore;
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;
type DateRow = import('../server/store.ts').DateRow;

const notice = (id: string, fields: Partial<NormalizedNotice> = {}): NormalizedNotice => ({
  id, ref: id, title: `Policy statement ${id}`, regulator: 'UK FCA', jurisdiction: 'UNITED KINGDOM', jurisdictionCode: 'UK',
  type: 'POLICY', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Policy Statements', severity: 'info',
  dossierUrl: `https://www.fca.org.uk/${id}`, ...fields
} as NormalizedNotice);

test('a page date read for a notice is merged into it as stored now, not written over a newer save', async () => {
  const store = (await openStore())!;
  await store.save([notice('ps-1', { title: 'Old title' })], 'fca');
  // The page-date backfill reads its copy, then a source saves the notice again
  const [read] = await store.undated(10);
  await store.save([notice('ps-1', { title: 'New title' })], 'fca');
  await store.patch(read.id, { pageDateTried: true });
  const kept = (await store.byIds(['ps-1'])).get('ps-1')!;
  assert.equal(kept.title, 'New title');
  assert.equal(kept.pageDateTried, true);

  // A date is set only while the notice has none, in the row and the column alike
  await store.patch('ps-1', { publishedAt: '2026-10-01T00:00:00.000Z', issuedTimeAgo: '3 weeks ago' });
  await store.save([notice('ps-2', { publishedAt: '2026-10-20T00:00:00.000Z' })]);
  await store.patch('ps-2', { publishedAt: '2026-01-01T00:00:00.000Z' });
  const db = (await getDb())!;
  const rows = await db.query(`SELECT id, published_at, data->>'publishedAt' AS shown FROM notices WHERE id IN ('ps-1', 'ps-2') ORDER BY id`);
  assert.deepEqual(rows.map(r => [r.id, new Date(r.published_at).toISOString(), r.shown]), [
    ['ps-1', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'],
    ['ps-2', '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z']
  ]);
});

test('notices are saved in id order, so two saves sharing notices lock them in the same order', async () => {
  const sent: unknown[][] = [];
  await saveNotices({ query: async (_sql, params) => { sent.push(params!); return []; } }, ['c', 'a', 'b', 'a'].map(id => toStored(notice(id))));
  assert.deepEqual(sent[0].filter((_, i) => i % 8 === 0), ['a', 'b', 'c']);
});

test('dates and links are read and rewritten in a transaction holding their own lock', async () => {
  const log: string[] = [];
  const tx = { query: async (sql: string, params?: unknown[]) => { log.push(`tx ${sql.slice(0, 40)} ${params ?? ''}`.trim()); return []; } };
  const store = noticeStore({
    query: async sql => { log.push(`outside ${sql.slice(0, 20)}`); return []; },
    transaction: async fn => { log.push('BEGIN'); const result = await fn(tx); log.push('COMMIT'); return result; }
  });
  await rebuildDates(store);
  await relinkAll(store);
  assert.deepEqual(log.filter(l => /BEGIN|COMMIT|advisory/.test(l)), [
    'BEGIN', 'tx SELECT pg_advisory_xact_lock($1) 7301926144', 'COMMIT',
    'BEGIN', 'tx SELECT pg_advisory_xact_lock($1) 7301926145', 'COMMIT'
  ]);
  assert.ok(!log.some(l => l.startsWith('outside')), 'every query of a rebuild runs inside its transaction');
});

// A store whose dates are kept in memory and whose lock is a queue, with a
// rebuild that pauses between reading the notices and writing their dates
function datesStore(locked: boolean) {
  const notices = new Map<string, NormalizedNotice>();
  let dates: DateRow[] = [];
  let queue = Promise.resolve();
  const store = {
    dateFields: async () => {
      const read = [...notices.values()];
      await new Promise(resolve => setTimeout(resolve, 30));
      return read;
    },
    replaceDates: async (rows: DateRow[], ids?: string[]) => {
      dates = [...dates.filter(d => ids && !ids.includes(d.noticeId)), ...rows];
    },
    exclusive: <T>(_lock: string, fn: (s: NoticeStore) => Promise<T>): Promise<T> => {
      if (!locked) return fn(store as unknown as NoticeStore);
      const run = queue.then(() => fn(store as unknown as NoticeStore));
      queue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
  return { store: store as unknown as NoticeStore, notices, dates: () => dates };
}

test('dates saved for a new notice while the whole history is rebuilt are kept', async () => {
  const closes = (id: string) => notice(id, { sourceDates: [{ kind: 'closes', date: '2026-12-01' }] });
  for (const locked of [false, true]) {
    const { store, notices, dates } = datesStore(locked);
    notices.set('old', closes('old'));
    const rebuilding = rebuildDates(store);
    // A visitor's refresh saves a new notice and its dates meanwhile
    await new Promise(resolve => setTimeout(resolve, 5));
    notices.set('new', closes('new'));
    await saveDates([closes('new')], store);
    await rebuilding;
    const ids = dates().map(d => d.noticeId).sort();
    // Without the lock the rebuild deletes them; with it they are written after
    assert.deepEqual(ids, locked ? ['new', 'old'] : ['old'], `locked: ${locked}`);
  }
});

test('links for a newly saved notice run under the same lock as a rebuild', async () => {
  const used: string[] = [];
  const store = {
    linkCandidates: async () => [], addLinks: async () => {}, replaceLinks: async () => {},
    exclusive: async (lock: string, fn: (s: unknown) => Promise<unknown>) => { used.push(lock); return fn(store); }
  } as unknown as NoticeStore;
  await linkSaved([notice('cp-1', { title: 'Consultation paper on capital', type: 'CONSULTATION', format: 'Consultations' })], store);
  await relinkAll(store);
  assert.deepEqual(used, ['links', 'links']);
});

// Two tabs share one localStorage
function sharedStorage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
}
// A notice as the page keeps it (src/lib/noticeShape.ts checks the shape)
const shown = (id: string) => ({ ...notice(id), jurisdictionCode: 'UK_EU', format: 'Announcements', publishedAt: '2026-10-01T00:00:00.000Z' }) as any;

test('a notice saved in one tab is kept when another tab saves one from its older list', () => {
  const storage = sharedStorage();
  const tabB = readBookmarks(storage);
  // Tab A saves X
  writeBookmarks(toggleNoticeBookmark(readBookmarks(storage), 'x', [shown('x')], null, true), storage);
  // Tab B, whose own list is still empty, saves Y starting from what is stored now
  assert.equal(tabB.length, 0);
  writeBookmarks(toggleNoticeBookmark(readBookmarks(storage), 'y', [shown('y')], null, true), storage);
  assert.deepEqual(readBookmarks(storage).map(n => n.id), ['x', 'y']);
  // Asking to save what is already saved (another tab saved it) leaves it saved
  const saved = readBookmarks(storage);
  assert.equal(toggleNoticeBookmark(saved, 'x', [shown('x')], null, true), saved);
  assert.deepEqual(toggleNoticeBookmark(saved, 'z', [], null, false), saved);
});

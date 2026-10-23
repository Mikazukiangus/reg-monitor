import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { buildNoticeCsv, exportNotice } from '../src/lib/exports';
import { defaultViewState, parseViewState, serializeViewState } from '../src/lib/urlState';
import { deriveNotifications, publicationTime, publishedInLastDays } from '../shared/derived';
import { paginationPages, readAlertRules, readBookmarks, readSavedViews, writeAlertRules, writeBookmarks, writeSavedViews } from '../src/lib/preferences';
import { DEFAULT_RULES } from '../shared/alertRules';
import type { RegulatoryNotice } from '../shared/regulatory';

const notice: RegulatoryNotice = {
  id: 'fca-older', ref: 'FCA "notice"', title: '=Older publication', regulator: 'UK FCA', jurisdiction: 'UNITED KINGDOM',
  jurisdictionCode: 'UK_EU', type: 'ANNOUNCEMENT', typeColorClass: { bg: 'x', text: 'y' }, impactScore: 7,
  issuedTimeAgo: 'Earlier', tags: ['test'], sector: 'Banking & Prudential', sectors: ['Banking & Prudential', 'AI, Cyber & Tech Risk'],
  format: 'Announcements', severity: 'high', dossierUrl: 'https://www.fca.org.uk/older', publishedAt: '2026-09-01T00:00:00Z',
  keyPoints: { points: ['Quoted "text", with a comma.\nSecond line.'], facts: [], refs: [], method: 'extractive',
    dates: [{ kind: 'takesEffect', date: '2099-01-01', text: 'The rules take effect on 1 January 2099.' }] },
  tagging: { sectors: {}, format: 'Source format', impact: ['Base score 7', 'Source date adjustment'] }
};

test('empty facets and monitoring filters survive shared-link reloads', () => {
  const state = defaultViewState();
  state.severities = [];
  Object.keys(state.jurisdictions).forEach(k => state.jurisdictions[k as keyof typeof state.jurisdictions] = false);
  Object.keys(state.sectors).forEach(k => state.sectors[k as keyof typeof state.sectors] = false);
  state.headerJurisdiction = 'Malaysia'; state.dateFrom = '2026-09-01'; state.dateTo = '2026-10-10'; state.onlySaved = true;
  assert.deepEqual(parseViewState(serializeViewState(state)), state);
  assert.equal(parseViewState('?from=2026-02-30&to=invalid&scope=unknown').dateFrom, '');
  assert.equal(parseViewState('?from=2026-02-30&to=invalid&scope=unknown').headerJurisdiction, 'All');
});

test('future publications are scheduled and never count as recent or unread', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(publicationTime('2026-10-13T00:00:00Z', now), 'Scheduled for 13 Oct 2026');
  assert.equal(publicationTime('invalid', now), 'Date unavailable');
  assert.equal(publishedInLastDays('2026-10-13T00:00:00Z', 7, now), false);
  assert.equal(publishedInLastDays('2026-10-03T12:00:00Z', 7, now), true);
  assert.equal(publishedInLastDays('2026-10-03T11:59:59Z', 7, now), false);
  assert.equal(deriveNotifications([{ ...notice, publishedAt: '2026-10-13T00:00:00Z' }], now)[0].unread, false);
});

test('pagination stays bounded for large feeds and includes the current page', () => {
  assert.deepEqual(paginationPages(1, 1), [1]);
  assert.deepEqual(paginationPages(10, 53), [1, 'gap', 9, 10, 11, 'gap', 53]);
  for (let page = 1; page <= 1000; page++) {
    const links = paginationPages(page, 1000);
    assert.ok(links.length <= 7 && links.includes(page) && links.includes(1) && links.includes(1000));
  }
});

test('exports preserve quotes, all sectors, date meanings and score reasons, with optional key points', () => {
  const exported = exportNotice(notice, true);
  assert.deepEqual(exported.sectors, notice.sectors);
  assert.equal(exported.dateKind, 'Takes effect');
  assert.equal(exported.deadlineDate, '2099-01-01');
  assert.equal(exported.deadlineQuote, 'The rules take effect on 1 January 2099.');
  assert.deepEqual(exported.scoreReasons, notice.tagging!.impact);
  assert.ok(!('keyPoints' in exportNotice(notice, false)));
  const csv = buildNoticeCsv([notice], true);
  assert.match(csv, /"FCA ""notice"""/);
  assert.ok(csv.includes('"\'=Older publication"'), 'formula-like source titles remain text');
  assert.ok(csv.includes('Banking & Prudential; AI, Cyber & Tech Risk'));
  assert.ok(csv.includes('Quoted ""text"", with a comma.\nSecond line.'));
  assert.ok(csv.includes('Takes effect') && csv.includes('Base score 7\nSource date adjustment'));
  const excluded = buildNoticeCsv([notice], false);
  assert.ok(!excluded.includes('Quoted Key Points') && !excluded.includes('Second line.'));
});

test('bookmarks and views persist safely, rejecting broken storage and handling quota errors', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(writeBookmarks([notice], storage), true);
  assert.deepEqual(readBookmarks(storage), [notice]);
  const views = [{ id: 'a', name: 'Malaysia', query: '?scope=Malaysia' }];
  assert.equal(writeSavedViews(views, storage), true);
  assert.deepEqual(readSavedViews(storage), views);
  assert.deepEqual(readBookmarks({ ...storage, getItem: () => '[{"id":"broken"}]' }), []);
  assert.deepEqual(readSavedViews({ ...storage, getItem: () => '{invalid' }), []);
  assert.equal(writeBookmarks([notice], { ...storage, setItem: () => { throw new Error('Quota exceeded'); } }), false);
});

test('alert rules start from the defaults and keep what was saved, even no rules', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(readAlertRules(storage), DEFAULT_RULES);
  const rules = [{ ...DEFAULT_RULES[0], id: 'mine', enabled: false }];
  assert.equal(writeAlertRules(rules, storage), true);
  assert.deepEqual(readAlertRules(storage), rules);
  assert.equal(writeAlertRules([], storage), true);
  assert.deepEqual(readAlertRules(storage), []);
  assert.deepEqual(readAlertRules({ ...storage, getItem: () => '{invalid' }), DEFAULT_RULES);
  assert.deepEqual(readAlertRules({ ...storage, getItem: () => { throw new Error('Blocked'); } }), DEFAULT_RULES);
  assert.equal(writeAlertRules(rules, { ...storage, setItem: () => { throw new Error('Quota exceeded'); } }), false);
});

test('bookmarks saved under a renamed sector are kept, under its new name', () => {
  const old = {
    ...notice, sector: 'AI, Data Privacy, Cyber & Tech Risk', sectors: ['AI, Data Privacy, Cyber & Tech Risk', 'Banking & Prudential'],
    tags: ['FCA', 'AI, Data Privacy, Cyber & Tech Risk'], tagging: { ...notice.tagging!, sectors: { 'AI, Data Privacy, Cyber & Tech Risk': ['AI'] } }
  };
  const [n] = readBookmarks({ getItem: () => JSON.stringify([old]), setItem: () => {} });
  assert.equal(n?.sector, 'AI, Cyber & Tech Risk');
  assert.deepEqual(n.sectors, ['AI, Cyber & Tech Risk', 'Banking & Prudential']);
  assert.deepEqual(n.tags, ['FCA', 'AI, Cyber & Tech Risk']);
  assert.deepEqual(n.tagging?.sectors, { 'AI, Cyber & Tech Risk': ['AI'] });
});

test('history endpoints retrieve archived IDs and report actual scheduled-check results', async () => {
  process.env.VERCEL = '1'; process.env.DATABASE_URL = 'pglite';
  process.env.CRON_SECRET = 'monitoring-test-secret-of-32-chars-plus';
  const { getDb, saveNotices, storedNotices, saveScheduledCheck } = await import('../server/db.ts');
  const { createApp } = await import('../server.ts');
  const db = (await getDb())!;
  await saveNotices(db, [notice as any]);
  // A later feed refresh with no date must keep the backfilled JSON date.
  const { publishedAt: _date, keyPoints: _points, ...undated } = notice;
  await saveNotices(db, [undated as any]);
  assert.equal((await storedNotices(db, [notice.id])).get(notice.id)?.publishedAt, notice.publishedAt);
  await saveNotices(db, [{ ...undated, id: 'fca-pending' } as any, { ...undated, id: 'fca-unresolved', pageDateTried: true } as any]);
  await saveScheduledCheck(db, { id: 'completed', startedAt: '2026-10-10T09:00:00Z', completedAt: '2026-10-10T09:01:00Z', status: 'completed',
    summary: { sources: [{ name: 'FCA', read: 20, added: 1, withoutKeyPoints: 2 }], failed: [{ name: 'FTC', error: 'HTTP 404' }], pageDatesFound: 1 } });
  await saveScheduledCheck(db, { id: 'running', startedAt: '2026-10-10T12:00:00Z', completedAt: null, status: 'running', summary: null });
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/api/notices/by-id?ids=${encodeURIComponent(JSON.stringify([notice.id, 'missing']))}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.notices.length, 1); assert.equal(body.notices[0].id, notice.id); assert.equal(body.notices[0].archived, true);
    assert.equal((await fetch(`${base}/api/notices/by-id?ids=invalid`)).status, 400);
    assert.equal((await fetch(`${base}/api/notices/by-id?ids=${encodeURIComponent(JSON.stringify(Array(51).fill('x')))}`)).status, 400);
    const checksReply = await fetch(`${base}/api/feeds/checks`);
    // Kept by the CDN for a minute, so page loads do not each query the database
    assert.equal(checksReply.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');
    const checks = await checksReply.json();
    assert.equal(checks.latest.status, 'running');
    assert.equal(checks.lastCompletedAt, '2026-10-10T09:01:00.000Z');
    assert.deepEqual(checks.dateBackfill, { pending: 1, unresolved: 1 });
    assert.equal((await fetch(`${base}/api/feeds/poll`)).status, 401);
    // Config is a validated startup snapshot. The missing-secret (503) case
    // runs in a separate process in config.test.ts rather than mutating it here.
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

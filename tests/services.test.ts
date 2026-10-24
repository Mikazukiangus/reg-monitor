// The services the routes call (server/services/), given their own store,
// notices and mailer instead of the database, the sources and Resend
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
const { toStored } = await import('../server/store.ts');
const { runDigest } = await import('../server/services/digest.ts');
const { searchNotices, noticesByIds } = await import('../server/services/notices.ts');
const { scheduledCheckStatus } = await import('../server/services/feed.ts');
type NoticeStore = import('../server/store.ts').NoticeStore;
type DigestDeps = import('../server/services/digest.ts').DigestDeps;
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;
type CustomAlertRule = import('../shared/regulatory.ts').CustomAlertRule;

const notice = (id: string, fields: Partial<NormalizedNotice> = {}): NormalizedNotice => ({
  id, ref: id, title: `SFC fines broker ${id}`, regulator: 'SFC', jurisdiction: 'HONG KONG', jurisdictionCode: 'HK',
  type: 'ENFORCEMENT', typeColorClass: { bg: '', text: '' }, impactScore: 8, issuedTimeAgo: '', tags: [],
  sector: 'Securities & Markets', sectors: ['Securities & Markets'], format: 'Enforcement', severity: 'high',
  dossierUrl: `https://www.sfc.hk/${id}`, publishedAt: '2026-10-06T03:00:00.000Z', ...fields
} as NormalizedNotice);

const rule: CustomAlertRule = { id: 'r', name: 'SFC enforcement', jurisdictions: ['SFC'], minImpact: 5, keywords: ['fines'], enabled: true };

function digestDeps(notices: NormalizedNotice[], overrides: Partial<DigestDeps> = {}) {
  const sent: any[] = [];
  const deps: DigestDeps = {
    collect: async () => ({ notices, failed: ['FINRA'] }),
    send: async email => { sent.push(email); return { id: 'email-1' }; },
    rules: [rule],
    siteUrl: 'https://example.org',
    mail: { apiKey: 'key', to: ['owner@example.com'], from: 'RegSonar <digest@example.org>' },
    ...overrides
  };
  return { deps, sent };
}

test('a dry run returns the email for the chosen day and sends nothing', async () => {
  const { deps, sent } = digestDeps([notice('a'), notice('b', { publishedAt: '2026-10-07T03:00:00.000Z' })]);
  const run = await runDigest({ day: '2026-10-06', dryRun: true }, deps);
  assert.equal(run.kind, 'dryRun');
  if (run.kind !== 'dryRun') return;
  assert.deepEqual(run.summary, { day: '2026-10-06', checked: 2, matched: 1, failedSources: ['FINRA'], errors: null, subject: run.summary.subject });
  assert.match(run.summary.subject, /^RegSonar: 1 new notice matching your rules/);
  assert.deepEqual(run.matches, [{ id: 'a', title: 'SFC fines broker a', rules: ['SFC enforcement'] }]);
  assert.match(run.text, /Could not be read for this email: FINRA\./);
  assert.equal(sent.length, 0);
});

test('the digest is sent only when something matches and Resend is set up', async () => {
  const nothing = digestDeps([notice('a', { publishedAt: '2026-10-01T03:00:00.000Z' })]);
  assert.equal((await runDigest({ day: '2026-10-06' }, nothing.deps)).kind, 'nothingToSend');
  assert.equal(nothing.sent.length, 0);

  const unset = digestDeps([notice('a')], { mail: { apiKey: '', to: ['owner@example.com'], from: 'x' } });
  assert.equal((await runDigest({ day: '2026-10-06' }, unset.deps)).kind, 'notConfigured');
  const noRecipient = digestDeps([notice('a')], { mail: { apiKey: 'key', to: [], from: 'x' } });
  assert.equal((await runDigest({ day: '2026-10-06' }, noRecipient.deps)).kind, 'notConfigured');
  assert.equal(unset.sent.length + noRecipient.sent.length, 0);

  const { deps, sent } = digestDeps([notice('a')]);
  const run = await runDigest({ day: '2026-10-06' }, deps);
  assert.deepEqual(run.kind === 'sent' && run.id, 'email-1');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['owner@example.com']);
  assert.match(sent[0].html, /SFC fines broker a/);
});

test('without a day the digest covers yesterday in Singapore', async () => {
  const { deps } = digestDeps([]);
  const run = await runDigest({ dryRun: true }, deps);
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date(Date.now() - 86_400_000));
  assert.equal(run.summary.day, yesterday);
});

function store(overrides: Partial<NoticeStore>): NoticeStore {
  return overrides as NoticeStore;
}

test('history search and lookup say when no history is set up, and read stored notices back', async () => {
  assert.deepEqual(await searchNotices('stablecoin', null), { enabled: false, notices: [], nextCursor: null });
  assert.deepEqual(await noticesByIds(['a'], null), { enabled: false, notices: [] });
  assert.deepEqual(await scheduledCheckStatus(null), { enabled: false });

  const rows = [toStored({ ...notice('a'), archived: true } as NormalizedNotice), toStored(notice('b'))];
  const found = await searchNotices('broker', store({ search: async (q, limit) => ({ notices: q === 'broker' && limit === 40 ? rows : [], next: null }) }));
  assert.equal(found.enabled, true);
  assert.equal(found.nextCursor, null);
  assert.deepEqual(found.notices.map(n => n.id), ['a', 'b']);
  assert.ok(found.notices.every(n => n.archived), 'notices read from the history are marked as such');

  const byId = await noticesByIds(['b', 'missing'], store({ byIds: async ids => new Map(rows.filter(r => ids.includes(r.id)).map(r => [r.id, r])) }));
  assert.deepEqual(byId.notices.map(n => n.id), ['b']);

  const status = { latest: null, lastCompletedAt: null, dateBackfill: { pending: 0, unresolved: 0 } };
  const queue = { waiting: 3, failed: 1 };
  assert.deepEqual(await scheduledCheckStatus(store({ checkStatus: async () => status, jobCounts: async () => queue })), { enabled: true, ...status, queue });
});

test('a failing history is passed on to the route, which answers with its own message', async () => {
  const failing = store({ search: async () => { throw new Error('connection reset'); }, byIds: async () => { throw new Error('connection reset'); } });
  await assert.rejects(searchNotices('broker', failing), /connection reset/);
  await assert.rejects(noticesByIds(['a'], failing), /connection reset/);
});

test('routes reach the sources, the history and email only through the services', () => {
  const routes = readdirSync('server/routes').map(f => `server/routes/${f}`);
  const reachesPast = routes.filter(f => /from '\.\.\/(store|ingest|history|health|enrich|mailer|digest\/[a-z]+)\.js'|from '(\.\.\/)+(db|digest-rules)\.js'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(reachesPast, []);
});

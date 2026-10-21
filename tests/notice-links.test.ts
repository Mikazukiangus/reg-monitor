// Consultation links stored in the history (server/links.ts): found when
// notices are saved, rebuilt by the scheduled check, and shown on every
// notice the site serves, in an in-memory history database
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
const { tagNotice } = await import('../server/notice.ts');
const { linkSaved, relinkAll } = await import('../server/links.ts');
const { withHistory, withLinks } = await import('../server/history.ts');
const { searchNotices, noticesByIds } = await import('../server/services/notices.ts');
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

const notice = (id: string, title: string, publishedAt: string, format = 'Announcements', regulator = 'UK PRA') => tagNotice({
  id, ref: id, title, regulator, jurisdiction: 'UNITED KINGDOM', jurisdictionCode: 'UK_EU', type: 'PUBLICATION',
  typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [], sector: 'Banking & Prudential',
  format, severity: 'info', dossierUrl: `https://www.bankofengland.co.uk/${id}`, publishedAt, summary: `${title}.`
} as NormalizedNotice);

const cp = notice('pra-lti-cp', 'CP6/26 – High loan to income lending', '2026-04-01T00:00:00.000Z', 'Consultations');
const ps = notice('pra-lti-ps', 'PS19/26 – High loan to income lending', '2026-10-14T00:00:00.000Z');
const fees = notice('pra-fees-cp', 'CP7/26 – Regulated fees and levies: Rates proposals 2026/27', '2026-04-17T00:00:00.000Z', 'Consultations');
const stored = async () => (await (await getDb())!.query('SELECT consultation_id, conclusion_id FROM notice_links ORDER BY 1, 2'))
  .map((r: any) => `${r.consultation_id} <- ${r.conclusion_id}`);

test('an outcome saved months after its consultation is linked to it when it is saved', async () => {
  const store = (await openStore())!;
  await store.save([cp, fees], 'uk-pra-publications');
  await linkSaved([cp, fees], store);
  assert.deepEqual(await stored(), []);
  await store.save([ps], 'uk-pra-publications');
  await linkSaved([ps], store);
  assert.deepEqual(await stored(), ['pra-lti-cp <- pra-lti-ps']);
});

test('every notice the site serves shows its links: the feed, search and shared links', async () => {
  const store = (await openStore())!;
  // The consultation is older than the feed's 30 days; the outcome is live
  const { notices } = await withHistory([ps], store);
  assert.deepEqual(notices.find(n => n.id === 'pra-lti-ps')?.related?.map(l => [l.id, l.relation, l.title]),
    [['pra-lti-cp', 'consultation', 'CP6/26 – High loan to income lending']]);
  const found = (await searchNotices('loan income lending', store)).notices;
  assert.deepEqual(found.find(n => n.id === 'pra-lti-cp')?.related?.map(l => [l.id, l.relation]), [['pra-lti-ps', 'conclusion']]);
  const shared = (await noticesByIds(['pra-lti-cp'], store)).notices;
  assert.deepEqual(shared[0].related?.map(l => l.id), ['pra-lti-ps']);
  assert.equal(shared[0].related?.[0].dossierUrl, 'https://www.bankofengland.co.uk/pra-lti-ps');
});

test('the scheduled check\'s rebuild keeps links that still match and drops those that no longer do', async () => {
  const store = (await openStore())!;
  const db = (await getDb())!;
  // A link the matching no longer makes, as after a rule change
  await db.query(`INSERT INTO notice_links (consultation_id, conclusion_id, score) VALUES ('pra-fees-cp', 'pra-lti-ps', 0.9)`);
  const [before] = await db.query(`SELECT found_at FROM notice_links WHERE consultation_id = 'pra-lti-cp'`);
  assert.equal(await relinkAll(store), 1);
  assert.deepEqual(await stored(), ['pra-lti-cp <- pra-lti-ps']);
  const [after] = await db.query(`SELECT found_at FROM notice_links WHERE consultation_id = 'pra-lti-cp'`);
  assert.equal(after.found_at.getTime(), before.found_at.getTime(), 'a link found again keeps when it was first found');
});

test('without a history, the notices at hand are linked with each other', async () => {
  const linked = await withLinks([cp, ps, fees], null);
  assert.deepEqual(linked.map(n => (n.related ?? []).map(l => l.id)), [['pra-lti-ps'], ['pra-lti-cp'], []]);
});

// Every date a notice has, stored in the history's notice_dates table for
// queries in SQL (server/dates.ts): filled when notices are saved, rebuilt by
// the scheduled check, and read by sql/upcoming-deadlines.sql, in an
// in-memory history database
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { upcomingDate } from '../shared/keyDate.ts';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
const { tagNotice } = await import('../server/notice.ts');
const { saveDates, rebuildDates } = await import('../server/dates.ts');
const { fromArchive } = await import('../server/history.ts');
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

// A notice whose document states these sentences
const notice = (id: string, type: string, title: string, sentences: string[] = [], fields: object = {}) => tagNotice({
  id, ref: id, title, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG', type,
  typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [], sector: 'Banking & Prudential',
  format: 'Circulars', severity: 'info', dossierUrl: `https://www.mas.gov.sg/${id}`, publishedAt: '2026-10-01T00:00:00.000Z',
  keyPoints: { points: [], refs: [], method: 'extractive', facts: sentences.map(text => ({ text, date: '' })) },
  ...fields
} as NormalizedNotice);

const stored = async (ids: string[]) => (await (await getDb())!.query(
  `SELECT notice_id, source, kind, to_char(date, 'YYYY-MM-DD') AS date, general, quote FROM notice_dates
   WHERE notice_id = ANY($1::text[]) ORDER BY notice_id, source DESC, date`, [ids]))
  .map((r: any) => [r.notice_id, r.source, r.kind, r.date, r.general, r.quote]);

test('saving notices stores the dates the regulator gives and those the document states', async () => {
  const store = (await openStore())!;
  const cp = notice('mas-cp', 'CONSULTATION', 'Consultation Paper on Reserve Requirements', [
    'The rules will take effect on 1 July 2099.',
    'The consultation closes on 1 December 2099.'
  ], { sourceDates: [{ kind: 'closes', date: '2099-12-01' }] });
  const other = notice('mas-other', 'CIRCULAR', 'Circular on Liquidity', ['FIs should comply by 30 June 2099.']);
  await store.save([cp, other], 'mas-consultations');
  await saveDates([cp, other], store);
  assert.deepEqual(await stored(['mas-cp', 'mas-other']), [
    ['mas-cp', 'regulator', 'closes', '2099-12-01', false, null],
    ['mas-cp', 'document', 'takesEffect', '2099-07-01', false, 'The rules will take effect on 1 July 2099.'],
    ['mas-cp', 'document', 'closes', '2099-12-01', true, 'The consultation closes on 1 December 2099.'],
    ['mas-other', 'document', 'complyBy', '2099-06-30', false, 'FIs should comply by 30 June 2099.']
  ]);
  // Saved again with a new closing date: only that notice's dates change
  const extended = { ...cp, sourceDates: [{ kind: 'closes' as const, date: '2099-12-15' }] };
  await store.save([extended], 'mas-consultations');
  await saveDates([extended], store);
  assert.deepEqual((await stored(['mas-cp', 'mas-other'])).filter(r => r[1] === 'regulator'), [['mas-cp', 'regulator', 'closes', '2099-12-15', false, null]]);
  assert.equal((await stored(['mas-other'])).length, 1);
});

test('the scheduled check works out every stored notice\'s dates again, including copies stored with the old fields', async () => {
  const store = (await openStore())!;
  const db = (await getDb())!;
  // Stored by an older version: the regulator's date only as the label it showed
  const legacy = { ...notice('fedreg-x', 'RULE', 'Final Rule on Swap Reporting'), statutoryDeadline: 'Effective: 2099-03-01', deadlineDate: '2099-03-01' };
  await store.save([legacy as NormalizedNotice]);
  // A date the rules no longer find
  await db.query(`INSERT INTO notice_dates (notice_id, source, kind, date) VALUES ('mas-other', 'document', 'takesEffect', '2099-01-01')`);
  const count = await rebuildDates(store);
  assert.deepEqual(await stored(['fedreg-x', 'mas-other']), [
    ['fedreg-x', 'regulator', 'takesEffect', '2099-03-01', false, null],
    ['mas-other', 'document', 'complyBy', '2099-06-30', false, 'FIs should comply by 30 June 2099.']
  ]);
  assert.equal(count, (await db.query('SELECT count(*)::int AS n FROM notice_dates'))[0].n);
});

test('sql/upcoming-deadlines.sql gives each notice the date the site shows while it is ahead', async () => {
  const store = (await openStore())!;
  const db = (await getDb())!;
  const TODAY = '2026-10-21';
  const notices = [
    // Comments still open come before a date it takes effect
    notice('q-open', 'CONSULTATION', 'Consultation on Capital', ['The rules will take effect on 1 July 2027.'], { sourceDates: [{ kind: 'closes', date: '2026-11-30' }] }),
    // Closed, and only proposed to take effect: nothing ahead
    notice('q-closed', 'CONSULTATION', 'Consultation on Fees', ['The rules will take effect on 1 July 2027.'], { sourceDates: [{ kind: 'closes', date: '2026-10-01' }] }),
    // A closing date stated generally counts on a consultation only
    notice('q-general', 'CONSULTATION', 'Consultation on Disclosure', ['The consultation closes on 15 November 2026.']),
    notice('q-quoted', 'CIRCULAR', 'Circular on Disclosure', ['The consultation closes on 15 November 2026.', 'FIs should comply by 31 March 2027.']),
    // The soonest of the dates it takes effect or must be met
    notice('q-soonest', 'CIRCULAR', 'Guidelines on AI Risk', ['FIs should comply by 7 October 2028.', 'The Guidelines will take effect on 7 October 2027.']),
    // The regulator's dates come before the document's
    notice('q-regulator', 'RULE', 'Final Rule on Margin', ['The rules will take effect on 1 November 2026.'], { sourceDates: [{ kind: 'takesEffect', date: '2026-12-01' }] }),
    // A round-up: none of the dates its text quotes, but the regulator's own
    notice('q-digest', 'CIRCULAR', 'Regulatory Digest – October 2026', ['The taxonomy will take effect from 1 January 2027.']),
    notice('q-bulletin', 'CIRCULAR', 'Market Bulletin', [], { sourceDates: [{ kind: 'takesEffect', date: '2027-01-01' }] }),
    // Enforcement actions show no date to take effect
    notice('q-enforcement', 'ENFORCEMENT ACTION', 'Director disqualified', [], { sourceDates: [{ kind: 'takesEffect', date: '2027-01-01' }] }),
    // Today is still ahead
    notice('q-today', 'CIRCULAR', 'Circular on Reporting', [], { sourceDates: [{ kind: 'complyBy', date: TODAY }] })
  ];
  await store.save(notices);
  await rebuildDates(store);
  const sql = readFileSync('sql/upcoming-deadlines.sql', 'utf8').replace(`(now() AT TIME ZONE 'Asia/Hong_Kong')::date`, `'${TODAY}'::date`);
  const ids = new Set(notices.map(n => n.id));
  const rows = (await db.query(sql)).filter((r: any) => ids.has(r.notice_id));
  const fromSql = Object.fromEntries(rows.map((r: any) => [r.notice_id, `${r.what}: ${new Date(r.date).toISOString().slice(0, 10)}`]));
  const onSite = Object.fromEntries(notices.flatMap(n => {
    const shown = upcomingDate(fromArchive(n), TODAY);
    return shown ? [[n.id, shown.text]] : [];
  }));
  assert.deepEqual(fromSql, onSite);
  assert.deepEqual(fromSql, {
    'q-open': 'Comments close: 2026-11-30',
    'q-general': 'Comments close: 2026-11-15',
    'q-quoted': 'Comply by: 2027-03-31',
    'q-soonest': 'Takes effect: 2027-10-07',
    'q-regulator': 'Takes effect: 2026-12-01',
    'q-bulletin': 'Takes effect: 2027-01-01',
    'q-today': `Comply by: ${TODAY}`
  });
  // Soonest first
  assert.deepEqual(rows.map((r: any) => r.notice_id).slice(0, 2), ['q-today', 'q-general']);
});

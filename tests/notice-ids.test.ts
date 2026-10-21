// How notices are named: ids that do not depend on a notice's place in a list,
// links with no path, and saving a list that names one notice twice.
// tests/sources.test.ts checks that every recorded notice keeps its id.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
const { lastPathPart, shortHash } = await import('../server/text.ts');
const { parseFederalRegister } = await import('../server/sources/federal-register.ts');
const { fetchAsxConsultations } = await import('../server/sources/asx.ts');
const { idConflicts } = await import('../server/ingest.ts');
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

test('a link names a notice by the last part of its path', () => {
  assert.equal(lastPathPart('https://www.esma.europa.eu/press-news/esma-news/esma-publishes-report.html'), 'esma-publishes-report');
  // HKEX links all end in ?sc_lang=en, which names nothing
  assert.equal(lastPathPart('https://www.hkex.com.hk/News/Regulatory-Announcements/2026/261006news?sc_lang=en'), '261006news');
});

test('a link with no path is named by its query', () => {
  assert.equal(lastPathPart('https://www.gov.ca.gov/?p=12345'), 'p-12345');
  assert.notEqual(lastPathPart('https://coag.gov/?p=1'), lastPathPart('https://coag.gov/?p=2'));
  assert.throws(() => lastPathPart('https://coag.gov/'), /No path or query/);
});

test('a short hash is eight hex characters and the same for the same text', () => {
  assert.match(shortHash('Consultation on margin rules'), /^[0-9a-f]{8}$/);
  assert.equal(shortHash('Consultation on margin rules'), shortHash('Consultation on margin rules'));
  assert.notEqual(shortHash('Consultation on margin rules'), shortHash('Consultation on capital rules'));
});

test('a Federal Register document without a number is named by its link, not its place in the list', () => {
  const doc = (n: number) => ({
    title: `Proposed rule ${n} on swap reporting`, type: 'Proposed Rule', publication_date: '2026-10-01',
    html_url: `https://www.federalregister.gov/documents/2026/10/01/rule-${n}`, agencies: [{ name: 'Commodity Futures Trading Commission' }]
  });
  const ids = parseFederalRegister({ results: [doc(1), doc(2)] }).map(n => n.id);
  assert.equal(ids[0], `fedreg-${shortHash(doc(1).html_url)}`);
  assert.notEqual(ids[0], ids[1]);
  // A new document at the top of the list leaves the others' ids alone
  const later = parseFederalRegister({ results: [doc(3), doc(1), doc(2)] }).map(n => n.id);
  assert.deepEqual(later.slice(1), ids);
  // A document number, when there is one, is still the id
  assert.equal(parseFederalRegister({ results: [{ ...doc(1), document_number: '2026-12345' }] })[0].id, 'fedreg-2026-12345');
});

test('an ASX consultation without a PDF is named by its title, not its place in the table', async () => {
  const row = (day: string, text: string, link = '') =>
    `<tr><td>${day}</td><td><p>${text}${link ? ` <a href="${link}">Paper</a>` : ''}</p></td></tr>`;
  const page = (rows: string[]) => `<h2>ASX public consultations</h2><table>${rows.join('')}</table>`;
  const first = row('2/10/2026', 'On Friday 2 October 2026, ASX published a consultation paper on settlement fees.');
  const second = row('2/10/2026', 'On Friday 2 October 2026, ASX published a consultation paper on clearing margins.');
  const withPdf = row('1/10/2026', 'On Thursday 1 October 2026, ASX published a consultation paper on listing rules.', '/content/dam/asx/listing-rules-paper.pdf');
  const realFetch = globalThis.fetch;
  try {
    let html = page([first, second, withPdf]);
    globalThis.fetch = (async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
    const notices = await fetchAsxConsultations(3);
    const ids = notices.map(n => n.id);
    assert.equal(notices[0].title, 'ASX published a consultation paper on settlement fees.');
    assert.equal(ids[0], `asx-con-2026-10-02-${shortHash(notices[0].title)}`);
    assert.notEqual(ids[0], ids[1]);
    assert.equal(ids[2], 'asx-con-2026-10-01-listing-rules-paper');
    // The rows swap places: each keeps its id
    html = page([second, first, withPdf]);
    const swapped = (await fetchAsxConsultations(3)).map(n => n.id);
    assert.deepEqual([swapped[1], swapped[0], swapped[2]], ids);
  } finally {
    globalThis.fetch = realFetch;
  }
});

const notice = (id: string, dossierUrl: string) => ({ id, dossierUrl } as NormalizedNotice);

test('an id that already names another document is reported', () => {
  const stored = new Map([['esma-report', { dossierUrl: 'https://www.esma.europa.eu/report.html' }]]);
  // The same link again, and a new notice: nothing to report
  assert.deepEqual(idConflicts([notice('esma-report', 'https://www.esma.europa.eu/report.html'), notice('esma-new', 'https://www.esma.europa.eu/new')], stored), []);
  // Saved with a different link
  assert.deepEqual(idConflicts([notice('esma-report', 'https://www.esma.europa.eu/report.pdf')], stored), [
    { id: 'esma-report', saved: 'https://www.esma.europa.eu/report.html', read: 'https://www.esma.europa.eu/report.pdf' }
  ]);
  // Two notices read with one id; the same notice listed twice is not a conflict
  assert.deepEqual(idConflicts([notice('a', 'https://x.gov/1'), notice('a', 'https://x.gov/1'), notice('a', 'https://x.gov/2')], new Map()), [
    { id: 'a', saved: 'https://x.gov/1', read: 'https://x.gov/2' }
  ]);
});

test('a list that names one notice twice is saved, keeping the first copy', async () => {
  const db = (await getDb())!;
  // Postgres refuses to change one row twice in a statement, which would lose the whole batch
  await assert.rejects(db.query(
    `INSERT INTO notices (id, regulator, jurisdiction_code, format, title, data) VALUES ($1, 'HKMA', 'HK', 'Circulars', 'A', '{}'::jsonb), ($1, 'HKMA', 'HK', 'Circulars', 'B', '{}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`, ['raw-twice']
  ), /cannot affect row a second time/);
  const store = (await openStore())!;
  const circular = (id: string, title: string) => ({
    id, ref: id, title, regulator: 'HKMA', jurisdiction: 'HONG KONG', jurisdictionCode: 'HK', type: 'CIRCULAR',
    typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [], sector: 'Banking & Prudential',
    format: 'Circulars', severity: 'info', dossierUrl: `https://brdr.hkma.gov.hk/eng/doc-ldg/current/${id}`, publishedAt: '2026-04-28T02:00:00.000Z'
  } as NormalizedNotice);
  await store.save([circular('hkma-cir-1', 'First copy'), circular('hkma-cir-2', 'Another circular'), circular('hkma-cir-1', 'Second copy')]);
  const saved = await store.byIds(['hkma-cir-1', 'hkma-cir-2']);
  assert.equal(saved.size, 2);
  assert.equal(saved.get('hkma-cir-1')?.title, 'First copy');
});

// The feed's filters and facet counts (src/lib/feedFilter.ts), and how sync
// results are summarised per endpoint
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countFacets, filterNotices, type FeedFilters, type FilterContext } from '../src/lib/feedFilter.ts';
import { defaultViewState } from '../src/lib/urlState.ts';
import { createSearchPattern } from '../src/lib/search.ts';
import { mergeSyncResults } from '../src/hooks/useFeedSync.ts';
import type { RegulatoryNotice } from '../shared/regulatory.ts';

const notice = (id: string, fields: Partial<RegulatoryNotice> = {}): RegulatoryNotice => ({
  id, ref: id, title: `Notice ${id}`, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CIRCULAR', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Circulars', severity: 'info',
  dossierUrl: `https://example.org/${id}`, ...fields
} as RegulatoryNotice);

const { headerJurisdiction, severities, jurisdictions, sectors, format, sort, onlyNew, onlySaved, dateFrom, dateTo } = defaultViewState();
const all: FeedFilters = { headerJurisdiction, severities, jurisdictions, sectors, format, sort, onlyNew, onlySaved, dateFrom, dateTo };
const context: FilterContext = { isNew: () => false, bookmarkedIds: new Set(), archiveMatchIds: new Set(), searchPatterns: [] };
const ids = (notices: RegulatoryNotice[]) => notices.map(n => n.id);

test('the default filters keep every notice', () => {
  const notices = [notice('a'), notice('b', { jurisdictionCode: 'US', severity: 'critical' })];
  assert.equal(filterNotices(notices, all, context).length, 2);
});

test('the header choice keeps its jurisdictions only', () => {
  const notices = [notice('sg'), notice('us', { jurisdictionCode: 'US' }), notice('eu', { jurisdictionCode: 'UK_EU' }), notice('jp', { jurisdictionCode: 'JP' })];
  assert.deepEqual(ids(filterNotices(notices, { ...all, headerJurisdiction: 'UK US Global' }, context)), ['us', 'eu']);
  assert.deepEqual(ids(filterNotices(notices, { ...all, headerJurisdiction: 'Australia Japan' }, context)), ['jp']);
});

test('a notice shows if any of its sectors is selected', () => {
  const both = notice('both', { sectors: ['Banking & Prudential', 'Data Privacy & Protection'] });
  const filters = { ...all, sectors: { ...all.sectors, 'Banking & Prudential': false } };
  assert.deepEqual(ids(filterNotices([notice('bank'), both], filters, context)), ['both']);
});

test('only new leaves out notices seen before and notices from the history', () => {
  const notices = [notice('new'), notice('seen'), notice('old', { archived: true })];
  const isNew = (id: string) => id !== 'seen';
  assert.deepEqual(ids(filterNotices(notices, { ...all, onlyNew: true }, { ...context, isNew })), ['new']);
});

test('dates filter by the day published in the regulator\'s time zone', () => {
  const notices = [
    notice('early', { publishedAt: '2026-10-09T16:30:00Z' }), // 10 October in Singapore
    notice('undated'),
    notice('late', { publishedAt: '2026-10-12T02:00:00Z' })
  ];
  assert.deepEqual(ids(filterNotices(notices, { ...all, dateFrom: '2026-10-10', dateTo: '2026-10-11' }, context)), ['early']);
});

test('search needs every term, but keeps what the history search found', () => {
  const notices = [notice('both', { title: 'Stablecoin custody rules' }), notice('one', { title: 'Stablecoin reserves' }), notice('found')];
  const searchPatterns = ['stablecoin', 'custody'].map(term => createSearchPattern([term]));
  const result = filterNotices(notices, all, { ...context, searchPatterns, archiveMatchIds: new Set(['found']) });
  assert.deepEqual(ids(result), ['both', 'found']);
});

test('only saved keeps bookmarked notices', () => {
  const result = filterNotices([notice('a'), notice('b')], { ...all, onlySaved: true }, { ...context, bookmarkedIds: new Set(['b']) });
  assert.deepEqual(ids(result), ['b']);
});

test('sorting: by impact, newest first, or soonest deadline with undated last', () => {
  const notices = [
    notice('a', { impactScore: 3, publishedAt: '2026-10-01T00:00:00Z', deadlineDate: '2026-12-01' }),
    notice('b', { impactScore: 9, publishedAt: '2026-10-03T00:00:00Z' }),
    notice('c', { impactScore: 6, publishedAt: '2026-10-02T00:00:00Z', deadlineDate: '2026-11-01' })
  ];
  assert.deepEqual(ids(filterNotices(notices, { ...all, sort: 'Highest Impact Score' }, context)), ['b', 'c', 'a']);
  assert.deepEqual(ids(filterNotices(notices, { ...all, sort: 'Most Recent First' }, context)), ['b', 'c', 'a']);
  assert.deepEqual(ids(filterNotices(notices, { ...all, sort: 'Consultation Deadline' }, context)), ['c', 'a', 'b']);
});

test('facet counts count every sector a notice has', () => {
  const counts = countFacets([
    notice('a', { sectors: ['Banking & Prudential', 'Data Privacy & Protection'], severity: 'critical' }),
    notice('b', { jurisdictionCode: 'HK', format: 'Consultations' })
  ]);
  assert.equal(counts.sector['Banking & Prudential'], 2);
  assert.equal(counts.sector['Data Privacy & Protection'], 1);
  assert.equal(counts.jurisdiction.SG, 1);
  assert.equal(counts.jurisdiction.HK, 1);
  assert.deepEqual(counts.severity, { critical: 1, high: 0, info: 1 });
  assert.deepEqual(counts.format, { Circulars: 1, Consultations: 1 });
});

test('an endpoint\'s sync summary adds its sources and is as old as the oldest', () => {
  const endpoint = { id: 'mas-gov', name: 'MAS', agency: 'MAS', jurisdiction: 'Singapore', protocol: '', auth: '', ingests: true, url: '', status: 'Operational' as const, pingMs: 10 };
  const [merged] = mergeSyncResults([endpoint], [
    { endpointId: 'mas-gov', ok: true, count: 4, lastSuccessAt: '2026-10-19T02:00:00Z' },
    { endpointId: 'mas-gov', ok: false, count: 2, lastSuccessAt: '2026-10-19T01:00:00Z', error: 'HTTP 503' }
  ]);
  assert.deepEqual(merged.sync, { ok: false, count: 6, error: 'HTTP 503', lastSuccessAt: '2026-10-19T01:00:00Z' });
});

// What the screens show, worked out from the notices: headline figures and
// source status (src/lib/feedStats.ts), the horizon, enforcement by
// regulator, the radar grid, and a rule from the Alert Rules form
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countNew, endpointHealth, feedFigures, ingestingAgencies, percentOf } from '../src/lib/feedStats.ts';
import { byMonth, horizonEvents, quarterOf } from '../src/lib/horizon.ts';
import { countByRegulator, enforcementRecords } from '../src/lib/enforcement.ts';
import { buildRadar, sectorsIn, shownJurisdiction } from '../src/lib/radar.ts';
import { ruleFromForm } from '../src/lib/alertRules.ts';
import type { EndpointMetric, RegulatoryNotice } from '../src/types/regulatory.ts';

const notice = (id: string, fields: Partial<RegulatoryNotice> = {}): RegulatoryNotice => ({
  id, ref: id, title: `Notice ${id}`, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CIRCULAR', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Circulars', severity: 'info',
  dossierUrl: `https://example.org/${id}`, ...fields
} as RegulatoryNotice);
const ids = (notices: { id: string }[]) => notices.map(n => n.id);
// Noon local time on 19 October 2026
const now = new Date(2026, 9, 19, 12);

test('headline figures: last 7 days, critical, open and closed consultations, closing within 14 days', () => {
  const figures = feedFigures([
    notice('recent', { publishedAt: new Date(2026, 9, 15).toISOString(), severity: 'critical' }),
    notice('old', { publishedAt: new Date(2026, 8, 1).toISOString() }),
    notice('open-soon', { format: 'Consultations', deadlineDate: '2026-11-02' }),
    notice('open-later', { format: 'Consultations', deadlineDate: '2026-11-03' }),
    notice('closed', { format: 'Consultations', statutoryDeadline: 'Comments closed: 2026-10-01', deadlineDate: '2026-10-01' }),
    notice('dated-circular', { deadlineDate: '2026-10-20' })
  ], now);
  assert.deepEqual(figures, { total: 6, critical: 1, recent: 1, openConsultations: 2, closedConsultations: 1, closingSoon: 1 });
});

test('notices from the history never count as new', () => {
  const isNew = (id: string) => id !== 'seen';
  assert.equal(countNew([notice('a'), notice('seen'), notice('b', { archived: true })], isNew), 1);
});

const endpoint = (id: string, status: EndpointMetric['status'], fields: Partial<EndpointMetric> = {}): EndpointMetric =>
  ({ id, name: id, agency: id, jurisdiction: '', url: '', protocol: '', auth: '', status, pingMs: null, ...fields });

test('source status: up, issues and the overall state, still checking until every endpoint has answered', () => {
  const health = endpointHealth([endpoint('a', 'Operational'), endpoint('b', 'Down'), endpoint('c', 'Operational'), endpoint('d', 'Degraded')]);
  assert.deepEqual(ids(health.up), ['a', 'c']);
  assert.deepEqual(ids(health.issues), ['b', 'd']);
  assert.equal(health.upPercent, 50);
  assert.equal(health.overall, 'Degraded');
  assert.equal(endpointHealth([endpoint('a', 'Operational'), endpoint('b', 'Checking')]).overall, 'Checking');
  assert.equal(endpointHealth([endpoint('a', 'Operational')]).overall, 'Operational');
  assert.equal(percentOf(1, 0), 0);
});

test('agencies read in the latest sync, without the "(via …)" part', () => {
  assert.deepEqual(ingestingAgencies([
    endpoint('sec', 'Operational', { agency: 'SEC (via Federal Register)', ingests: true, sync: { ok: true, count: 3 } }),
    endpoint('mas', 'Operational', { agency: 'MAS', ingests: true, sync: { ok: false, count: 0 } }),
    endpoint('probe', 'Operational', { agency: 'Probe only', sync: { ok: true, count: 0 } })
  ]), ['SEC']);
});

test('the horizon: dates from today on, soonest first, by quarter and month, with the sentence that names the date', () => {
  const events = horizonEvents([
    notice('past', { deadlineDate: '2026-10-18' }),
    notice('jan', { deadlineDate: '2027-01-05', deadlineQuote: 'Comments close on 5 January 2027.' }),
    notice('today', { deadlineDate: '2026-10-19' }),
    notice('nov', { deadlineDate: '2026-11-30', keyPoints: { points: [], facts: [{ text: 'Takes effect on 30 November 2026.', date: '2026-11-30' }] } as any })
  ], now);
  assert.deepEqual(events.map(e => [e.notice.id, e.days, e.quarter]), [['today', 0, 'Q4 2026'], ['nov', 42, 'Q4 2026'], ['jan', 78, 'Q1 2027']]);
  assert.equal(events[1].quote, 'Takes effect on 30 November 2026.');
  assert.equal(events[2].quote, 'Comments close on 5 January 2027.');
  assert.deepEqual(byMonth(events).map(m => [m.month, m.events.length]), [['October 2026', 1], ['November 2026', 1], ['January 2027', 1]]);
  assert.equal(quarterOf('2026-03-31'), 'Q1 2026');
});

test('enforcement: newest first, and regulators by most records then name', () => {
  const records = enforcementRecords([
    notice('a', { format: 'Enforcement', regulator: 'SEC', publishedAt: '2026-10-01T00:00:00Z' }),
    notice('b', { format: 'Enforcement', regulator: 'ASIC', publishedAt: '2026-10-03T00:00:00Z' }),
    notice('c', { format: 'Enforcement', regulator: 'SEC', publishedAt: '2026-10-02T00:00:00Z' }),
    notice('d', { format: 'Enforcement', regulator: 'MAS', publishedAt: '2026-10-04T00:00:00Z' }),
    notice('e', { format: 'Circulars', regulator: 'SEC' })
  ]);
  assert.deepEqual(ids(records), ['d', 'b', 'c', 'a']);
  assert.deepEqual(countByRegulator(records), [{ name: 'SEC', count: 2 }, { name: 'ASIC', count: 1 }, { name: 'MAS', count: 1 }]);
});

test('the radar: a notice is in each of its sectors, and phones start on the first jurisdiction with notices', () => {
  const radar = buildRadar([
    notice('hk-both', { jurisdictionCode: 'HK', sectors: ['Banking & Prudential', 'Data Privacy & Protection'], publishedAt: '2026-10-02T00:00:00Z' }),
    notice('hk-bank', { jurisdictionCode: 'HK', publishedAt: '2026-10-03T00:00:00Z' }),
    notice('us', { jurisdictionCode: 'US' })
  ]);
  assert.deepEqual(ids(radar.cell('Banking & Prudential', 'HK')), ['hk-bank', 'hk-both']);
  assert.equal(radar.counts.get('HK'), 2);
  assert.equal(radar.counts.get('SG'), 0);
  assert.equal(shownJurisdiction(radar, null).code, 'HK');
  assert.equal(shownJurisdiction(radar, 'US').code, 'US');
  const { busy, quiet } = sectorsIn(radar, 'HK');
  assert.deepEqual(busy.map(r => [r.sector, r.cell.length]), [['Banking & Prudential', 2], ['Data Privacy & Protection', 1]]);
  assert.ok(quiet.includes('Insurance & Pensions') && !quiet.includes('Banking & Prudential'));
});

test('a rule from the form: comma lists trimmed, and none without a name', () => {
  assert.deepEqual(ruleFromForm({ name: 'Stablecoins', agencies: 'MAS, HKMA, ', minImpact: 5, keywords: ' stablecoin ,reserve' }, 'rule-1'), {
    id: 'rule-1', name: 'Stablecoins', jurisdictions: ['MAS', 'HKMA'], minImpact: 5, keywords: ['stablecoin', 'reserve'], enabled: true
  });
  assert.equal(ruleFromForm({ name: '  ', agencies: 'MAS', minImpact: 0, keywords: '' }), null);
});

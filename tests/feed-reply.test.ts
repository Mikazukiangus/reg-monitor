// The page's check of the feed reply (src/api/feedReply.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFeedReply } from '../src/api/feedReply.ts';
import { noticeProblem } from '../src/lib/noticeShape.ts';
import { keyDate } from '../shared/keyDate.ts';

// A notice as the server sends it, with the optional parts it may carry
const notice = (id: string, extra: Record<string, unknown> = {}) => ({
  id, ref: `MAS ${id}`, title: 'MAS consults on proposed changes to capital rules', regulator: 'MAS',
  jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG', type: 'CONSULTATION', typeColorClass: { bg: 'bg-x', text: 'text-x' },
  impactScore: 7, issuedTimeAgo: '2 days ago', publishedAt: '2026-10-18T02:00:00.000Z', tags: ['MAS', 'Consultations'],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Consultations', severity: 'high',
  dossierUrl: 'https://www.mas.gov.sg/x', isLiveFeed: true,
  keyPoints: { points: ['MAS proposes changes.'], facts: [{ text: 'Comments close on 1 December 2026.', date: '2026-12-01' }], refs: [], method: 'extractive', published: null },
  tagging: { sectors: { 'Banking & Prudential': ['capital rules'] }, format: 'consult', impact: ['Open consultation: 7'] },
  ...extra
});
const endpoint = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: 'MAS', agency: 'Monetary Authority of Singapore', jurisdiction: 'SG', url: 'https://www.mas.gov.sg',
  protocol: 'JSON', auth: 'None', status: 'Operational', statusCode: 200, pingMs: 120, ingests: true, ...extra
});
const reply = (extra: Record<string, unknown> = {}) => ({
  success: true, count: 2, lastSync: '2026-10-20T06:16:32.424Z',
  notices: [notice('a'), notice('b', { archived: true, language: 'zh', sourceDates: [{ kind: 'closes', date: '2026-12-01' }] })],
  archive: { enabled: true, count: 1073, since: '2013-08-30T15:59:59.000Z' },
  sources: [{ endpointId: 'mas', name: 'MAS Consultations', ok: true, count: 2, lastSuccessAt: '2026-10-20T06:00:00.000Z' },
    { endpointId: 'ftc', name: 'FTC on AI and Privacy', ok: false, count: 0, lastSuccessAt: null, error: 'HTTP 404' }],
  endpoints: [endpoint('mas'), endpoint('ftc', { status: 'Down', statusCode: null, pingMs: null })],
  ...extra
});

test('a well-formed reply passes whole, with nothing left out', () => {
  const r = checkFeedReply(reply());
  assert.ok(r.ok);
  assert.deepEqual(r.leftOut, []);
  const { success, count, ...rest } = reply();
  assert.deepEqual(r.data, rest);
});

test('a reply that is not a feed is refused, saying why', () => {
  const problem = (body: unknown) => { const r = checkFeedReply(body); return r.ok ? null : r.problem; };
  assert.equal(problem(null), 'the reply is not a JSON object');
  assert.equal(problem([notice('a')]), 'the reply is not a JSON object');
  assert.equal(problem({ success: false, error: 'Feed sync failed' }), 'the server reported a failure: Feed sync failed');
  assert.equal(problem({ success: true }), 'the reply has no notices list');
  assert.equal(problem(reply({ notices: { a: notice('a') } })), 'the reply has no notices list');
  assert.equal(problem(reply({ notices: [{ id: 'a' }, notice('b', { severity: 'urgent' })] })),
    'none of the 2 notices can be shown (notice a: title is not text)');
});

test('a malformed notice, endpoint or source result is left out and listed; the rest is shown', () => {
  const r = checkFeedReply(reply({
    notices: [notice('a'), notice('b', { jurisdictionCode: 'FR' }), notice('c', { impactScore: '7' }), { title: 'no id' }, notice('d', { sourceDates: [{ kind: 'closes', date: '1 December 2026' }] })],
    endpoints: [endpoint('mas'), endpoint('x', { status: 'Fine' })],
    sources: [{ endpointId: 'mas', ok: true, count: 2 }, { endpointId: 'y', ok: 'yes', count: 1 }]
  }));
  assert.ok(r.ok);
  assert.deepEqual(r.data.notices!.map(n => n.id), ['a']);
  assert.deepEqual(r.data.endpoints!.map(e => e.id), ['mas']);
  assert.deepEqual(r.data.sources!.map(s => s.endpointId), ['mas']);
  assert.deepEqual(r.leftOut, [
    'notice b: unknown jurisdictionCode "FR"',
    'notice c: impactScore is not a number',
    'notice #3: id is not text',
    'notice d: sourceDates is malformed',
    'endpoint x: unknown status "Fine"',
    'source y: ok is not true or false'
  ]);
});

test('an empty feed is a valid feed; a malformed archive or sync time is ignored', () => {
  const r = checkFeedReply(reply({ notices: [], archive: { enabled: 'yes' }, lastSync: 'yesterday', endpoints: 'none' }));
  assert.ok(r.ok);
  assert.deepEqual(r.data.notices, []);
  assert.equal(r.data.archive, undefined);
  assert.equal(r.data.lastSync, undefined);
  assert.equal(r.data.endpoints, undefined);
});

test('a copy saved under an old sector name (offline) passes, under the current name', () => {
  const old = notice('a', { sector: 'AI, Data Privacy, Cyber & Tech Risk', sectors: ['AI, Data Privacy, Cyber & Tech Risk'], tags: ['MAS', 'AI, Data Privacy, Cyber & Tech Risk'] });
  assert.match(String(noticeProblem(old)), /unknown sector/);
  const r = checkFeedReply(reply({ notices: [old] }));
  assert.ok(r.ok);
  assert.equal(r.data.notices![0].sector, 'AI, Cyber & Tech Risk');
  assert.deepEqual(r.data.notices![0].tags, ['MAS', 'AI, Cyber & Tech Risk']);
});

test('a copy saved before dates were stored as sourceDates (offline) still shows its date', () => {
  const old = notice('a', { format: 'Consultations', statutoryDeadline: 'Comments close: 2099-12-01', deadlineDate: '2099-12-01' });
  const r = checkFeedReply(reply({ notices: [old] }));
  assert.ok(r.ok);
  assert.equal(keyDate(r.data.notices![0])?.text, 'Comments close: 2099-12-01');
});

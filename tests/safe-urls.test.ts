// Links shown with a notice come from regulators' pages and feeds: only HTTPS
// web links reach the page, the digest email and the downloads
// (shared/urls.ts), on the server and again in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from '../shared/urls.ts';
import { tagNotice } from '../server/notice.ts';
import { relatedOf } from '../shared/related.ts';
import { renderDigest } from '../server/digest/email.ts';
import { checkFeedReply } from '../src/api/feedReply.ts';
import { readBookmarks } from '../src/lib/preferences.ts';

const UNSAFE = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'ftp://ftp.example.gov/a.pdf',
  '//www.example.gov/a',
  '/press/a.html',
  'https://www.example.gov/a\r\nX-Injected: 1',
  'not a link',
  ''
];

test('only web links are kept, upgraded to HTTPS and otherwise as written', () => {
  for (const url of UNSAFE) assert.equal(safeUrl(url), undefined, JSON.stringify(url));
  assert.equal(safeUrl(undefined), undefined);
  assert.equal(safeUrl(42), undefined);
  assert.equal(safeUrl('http://www.example.gov/a?b=1'), 'https://www.example.gov/a?b=1');
  assert.equal(safeUrl('HTTP://www.example.gov/a'), 'https://www.example.gov/a');
  assert.equal(safeUrl(' https://www.example.gov/a '), 'https://www.example.gov/a');
  // Not re-encoded: the stored text stays the regulator's
  assert.equal(safeUrl('https://www.example.gov/Consultation Paper (2026).pdf'), 'https://www.example.gov/Consultation Paper (2026).pdf');
  assert.equal(safeUrl('https://www.example.gov/新闻/a.html'), 'https://www.example.gov/新闻/a.html');
});

const serverNotice = (extra: Record<string, unknown>) => tagNotice({
  id: 'x-1', ref: 'X', title: 'Consultation on margin rules', regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CONSULTATION', typeColorClass: '', impactScore: 5, issuedTimeAgo: 'Recently', tags: [], sector: '', format: 'Consultations',
  severity: 'info', isLiveFeed: true, publishedAt: '2026-10-21T02:00:00.000Z', ...extra
} as any);

test('the server drops a notice\'s unsafe links and keeps the notice', () => {
  for (const url of UNSAFE) {
    const notice = serverNotice({ dossierUrl: url, keyPoints: { points: ['A point.'], facts: [], refs: [], method: 'extractive', sourceUrl: url } });
    assert.ok(!('dossierUrl' in notice), JSON.stringify(url));
    assert.ok(notice.keyPoints && !('sourceUrl' in notice.keyPoints), JSON.stringify(url));
    assert.deepEqual(notice.keyPoints?.points, ['A point.']);
  }
  const safe = serverNotice({ dossierUrl: 'http://www.example.gov/cp', keyPoints: { points: [], facts: [], refs: [], method: 'extractive', sourceUrl: 'https://www.example.gov/cp.pdf' } });
  assert.equal(safe.dossierUrl, 'https://www.example.gov/cp');
  assert.equal(safe.keyPoints?.sourceUrl, 'https://www.example.gov/cp.pdf');
  // A notice without links gains none
  const bare = serverNotice({});
  assert.ok(!('dossierUrl' in bare) && !('keyPoints' in bare));
});

test('a linked consultation or conclusion carries only a safe link', () => {
  const pairs = [{ consultationId: 'c', conclusionId: 'r', score: 1 }];
  const byId = new Map([
    ['c', { id: 'c', regulator: 'MAS', format: 'Consultations', title: 'Consultation', dossierUrl: 'javascript:alert(1)' }],
    ['r', { id: 'r', regulator: 'MAS', format: 'Circulars', title: 'Response', dossierUrl: 'http://www.mas.gov.sg/r' }]
  ]);
  assert.equal(relatedOf('r', pairs, byId)[0].dossierUrl, undefined);
  assert.equal(relatedOf('c', pairs, byId)[0].dossierUrl, 'https://www.mas.gov.sg/r');
});

test('the digest email links only safe addresses', () => {
  const notice = serverNotice({ dossierUrl: 'javascript:alert(1)', title: 'Consultation on <b>margin</b> rules' });
  const { html } = renderDigest([{ notice, rules: ['All'] } as any], '2026-10-21', 'https://regsonar.example.com');
  assert.ok(!/javascript:/i.test(html));
  assert.ok(html.includes('Consultation on &lt;b&gt;margin&lt;/b&gt; rules'));
});

// A notice as the server sends it
const replyNotice = (id: string, extra: Record<string, unknown> = {}) => ({
  id, ref: `MAS ${id}`, title: 'MAS consults on capital rules', regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CONSULTATION', typeColorClass: { bg: 'bg-x', text: 'text-x' }, impactScore: 7, issuedTimeAgo: '2 days ago', tags: ['MAS'],
  sector: 'Banking & Prudential', format: 'Consultations', severity: 'high', dossierUrl: 'https://www.mas.gov.sg/x', ...extra
});

test('the page drops unsafe links in the feed reply and in saved notices, and keeps the notices', () => {
  const unsafe = replyNotice('js', {
    dossierUrl: 'javascript:alert(1)',
    keyPoints: { points: ['A point.'], facts: [], refs: [], method: 'extractive', sourceUrl: 'data:text/html,x' },
    related: [{ id: 'c', title: 'Consultation', relation: 'consultation', dossierUrl: 'vbscript:x' }, { id: 'd', title: 'Other', relation: 'conclusion', dossierUrl: 'http://www.mas.gov.sg/d' }]
  });
  const r = checkFeedReply({ notices: [replyNotice('ok'), unsafe] });
  assert.ok(r.ok);
  const [ok, js] = r.data.notices!;
  assert.equal(ok.dossierUrl, 'https://www.mas.gov.sg/x');
  assert.ok(!('dossierUrl' in js));
  assert.ok(js.keyPoints && !('sourceUrl' in js.keyPoints));
  assert.deepEqual(js.related?.map(l => l.dossierUrl), [undefined, 'https://www.mas.gov.sg/d']);

  const storage = { getItem: () => JSON.stringify([unsafe, replyNotice('saved', { dossierUrl: 'http://www.mas.gov.sg/old' })]), setItem: () => {} };
  assert.deepEqual(readBookmarks(storage).map(n => [n.id, n.dossierUrl]), [['js', undefined], ['saved', 'https://www.mas.gov.sg/old']]);
});

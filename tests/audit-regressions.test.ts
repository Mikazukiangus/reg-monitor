import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Highlight } from '../src/components/Highlight';
import { PdfDossierModal } from '../src/components/modals/PdfDossierModal';
import { daysUntil, localDay } from '../shared/derived';
import { readBookmarks, toggleNoticeBookmark, writeBookmarks } from '../src/lib/preferences';
import { createSearchPattern, searchTerms } from '../src/lib/search';
import type { RegulatoryNotice } from '../shared/regulatory';

const archived: RegulatoryNotice = {
  id: 'fca-building-stronger-uk-investment-culture', title: 'Building a stronger UK investment culture',
  regulator: 'UK FCA', jurisdiction: 'UNITED KINGDOM', jurisdictionCode: 'UK_EU',
  ref: 'FCA: building-stronger-uk-investment-culture', type: 'SPEECH',
  format: 'Announcements', severity: 'info', impactScore: 5, issuedTimeAgo: '30d ago',
  sector: 'Capital Markets & Listings', sectors: ['Capital Markets & Listings'], tags: ['Investments'],
  typeColorClass: { bg: 'bg-panel', text: 'text-ink' }, archived: true,
  dossierUrl: 'https://www.fca.org.uk/news/speeches/building-stronger-uk-investment-culture',
  publishedAt: '2026-09-16T07:58:16.000Z'
};

test('an archive-only open dossier can be bookmarked, persisted and removed', () => {
  const feed = [{ ...archived, id: 'a-loaded-notice' }];
  const saved = toggleNoticeBookmark([], archived.id, feed, archived);
  assert.deepEqual(saved, [archived]);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(writeBookmarks(saved, storage), true);
  const reloaded = readBookmarks(storage);
  assert.equal(reloaded[0].id, archived.id);
  assert.equal(reloaded[0].dossierUrl, archived.dossierUrl);
  assert.equal(reloaded[0].publishedAt, archived.publishedAt);
  assert.deepEqual(toggleNoticeBookmark(reloaded, archived.id, [], null), []);
});

test('bookmarks use the fresh loaded notice and never save an unrelated dossier', () => {
  const fresh = { ...archived, title: 'Updated source title' };
  assert.deepEqual(toggleNoticeBookmark([], archived.id, [fresh], archived), [fresh]);
  const saved: RegulatoryNotice[] = [];
  assert.equal(toggleNoticeBookmark(saved, 'not-the-open-notice', [], archived), saved);
});

test('Chinese, Japanese and Korean search terms match within unspaced text', () => {
  for (const [query, text] of [
    ['个人', '小型个人信息处理者个人信息保护简化措施规定'],
    ['信息', '个人信息出境认证办法'],
    ['個人', '改正個人情報保護法について'],
    ['プライバシー', '新しいプライバシー保護の指針'],
    ['개인정보', '개인정보보호위원회']
  ]) assert.ok(createSearchPattern(searchTerms(query)).test(text), query);
});

test('search retains case-insensitive English prefixes and requires every query term', () => {
  const fine = createSearchPattern(['fine']);
  assert.ok(fine.test('The SFC FINES a broker'));
  assert.ok(!fine.test('The terms are defined here'));
  assert.ok(!fine.test('Refinements to guidance'));
  const patterns = searchTerms('ICO personal').map(term => createSearchPattern([term]));
  assert.ok(patterns.every(pattern => pattern.test('ICO updates personal data guidance')));
  assert.ok(!patterns.every(pattern => pattern.test('ICO updates guidance')));
  assert.ok(fine.test('Fines') && fine.test('Fines'), 'filter patterns have no global cursor');
});

test('search handles accented word starts and treats regex syntax literally', () => {
  assert.ok(createSearchPattern(['épargne']).test('Épargne et protection'));
  assert.ok(!createSearchPattern(['épargne']).test('prépargne'));
  assert.ok(createSearchPattern(['C++']).test('C++ reporting'));
  assert.ok(!createSearchPattern(['C++']).test('CCCC reporting'));
  assert.ok(createSearchPattern(['[privacy]']).test('Update [privacy]'));
  assert.ok(!createSearchPattern([]).test('Any notice'));
});

test('highlighting marks the same native-script and English matches as search', () => {
  const text = '小型个人信息 / 改正個人情報 / capitalisation / defined';
  const html = renderToStaticMarkup(React.createElement(Highlight, { text, terms: ['个人', '個人', 'capital', 'fine'] }));
  const marked = [...html.matchAll(/<mark[^>]*>([^<]*)<\/mark>/g)].map(m => m[1]);
  assert.deepEqual(marked, ['个人', '個人', 'capital']);
  assert.equal(html.replace(/<[^>]*>/g, ''), text);
});

test('calendar days agree with relative days on both sides of UTC midnight', () => {
  const originalZone = process.env.TZ;
  try {
    for (const [zone, instant, expected] of [
      ['Asia/Singapore', '2026-10-15T17:00:00Z', '2026-10-16'],
      ['America/New_York', '2026-10-16T01:00:00Z', '2026-10-15'],
      ['UTC', '2026-10-16T01:00:00Z', '2026-10-16']
    ]) {
      process.env.TZ = zone;
      const now = new Date(instant);
      assert.equal(localDay(now), expected);
      assert.equal(daysUntil(expected, now), 0);
    }
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
});

test('the actual dossier Today marker uses Singapore day after local midnight', t => {
  const originalZone = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Singapore';
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-15T17:00:00Z') });
    const notice = { ...archived, publishedAt: '2026-10-14T00:00:00Z', deadlineDate: '2026-10-17', statutoryDeadline: 'Comments close: 2026-10-17' };
    const html = renderToStaticMarkup(React.createElement(PdfDossierModal, { notice, onClose() {} }));
    assert.match(html, /Today, 16 Oct 2026/);
    assert.doesNotMatch(html, /Today, 15 Oct 2026/);
    assert.match(html, /in 1 day/);
  } finally {
    t.mock.timers.reset();
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
});

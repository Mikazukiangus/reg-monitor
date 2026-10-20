// The files the page offers (src/lib/exports.ts) and the theme setting
// (src/lib/preferences.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDossierText, buildGapCsv, buildNoticeJson, exportFilename } from '../src/lib/exports.ts';
import { readTheme, writeTheme } from '../src/lib/preferences.ts';
import type { RegulatoryNotice } from '../shared/regulatory.ts';

const notice = {
  id: 'mas-1', ref: 'MAS-1', title: 'Consultation on stablecoin reserves', regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CONSULTATION', typeColorClass: { bg: '', text: '' }, impactScore: 7, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Consultations', severity: 'high',
  dossierUrl: 'https://www.mas.gov.sg/c1', statutoryDeadline: 'Comments close: 2026-11-30', deadlineQuote: 'Please submit comments by 30 November 2026.',
  keyPoints: { points: ['Issuers must hold reserves.'], facts: [{ text: 'Comments close on 30 November 2026.', date: '2026-11-30' }], refs: ['CP 1/2026'], ocr: true }
} as unknown as RegulatoryNotice;

test('the gap checklist CSV: BOM, the notice on comment lines, quoted cells, and typed formulas kept as text', () => {
  const csv = buildGapCsv(notice, [
    { requirement: 'Hold reserves "1:1"', owner: 'Treasury', deadline: '2026-11-30', status: 'Action-Required', notes: '=HYPERLINK("x")' }
  ]);
  assert.equal(csv, '﻿# MAS: Consultation on stablecoin reserves\r\n# Source: https://www.mas.gov.sg/c1\r\n' +
    '"Requirement","Owner","Deadline","Status","Notes"\r\n' +
    '"Hold reserves ""1:1""","Treasury","2026-11-30","Action-Required","\'=HYPERLINK(""x"")"\r\n');
});

test('the dossier text: the details, then only what is quoted, with the OCR note', () => {
  const text = buildDossierText(notice, '19 Oct 2026', new Date('2026-10-19T09:00:00Z'));
  const lines = text.split('\n');
  assert.equal(lines[0], 'REGSONAR NOTICE DOSSIER');
  assert.ok(lines.includes('Key date: Comments close: 2026-11-30 (from: "Please submit comments by 30 November 2026.")'));
  assert.ok(lines.includes('Impact score (rubric by document kind and dates): 7.0/10'));
  assert.ok(lines.includes('NOTE: the source is a scanned PDF read by OCR; quotes may contain recognition errors.'));
  assert.ok(lines.includes('- "Issuers must hold reserves."'));
  assert.ok(lines.includes('- "Comments close on 30 November 2026."'));
  assert.ok(lines.includes('CP 1/2026'));
  assert.equal(lines.at(-1), 'Generated 2026-10-19T09:00:00.000Z by RegSonar from public regulator publications.');
});

test('the notice JSON leaves key points out when asked, and files are named by the day', () => {
  assert.equal(JSON.parse(buildNoticeJson([notice], false))[0].keyPoints, undefined);
  assert.deepEqual(JSON.parse(buildNoticeJson([notice]))[0].keyPoints.points, ['Issuers must hold reserves.']);
  assert.equal(exportFilename('csv', new Date('2026-10-19T09:00:00Z')), 'RegSonar_Statutory_Export_2026-10-19.csv');
});

test('the theme: light or dark is saved, following the device saves nothing, and blocked storage follows the device', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  assert.equal(readTheme(storage), 'system');
  writeTheme('dark', storage);
  assert.equal(store.get('regsonar.theme'), 'dark');
  assert.equal(readTheme(storage), 'dark');
  writeTheme('system', storage);
  assert.equal(store.has('regsonar.theme'), false);
  store.set('regsonar.theme', 'purple');
  assert.equal(readTheme(storage), 'system');
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(readTheme(blocked), 'system');
  assert.doesNotThrow(() => writeTheme('light', blocked));
});

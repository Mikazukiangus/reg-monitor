// The date a notice shows (shared/keyDate.ts): which of its dates, how it is
// labelled once passed, and how copies stored with the old fields are read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hongKongDate, keyDate, sourceDatesOf, upcomingDate, withoutLegacyDateFields, type DatedNotice } from '../shared/keyDate.ts';
import type { DocumentDate, SourceDate } from '../shared/regulatory.ts';

const TODAY = '2026-10-21';
const circular = (fields: Partial<DatedNotice> = {}): DatedNotice => ({ type: 'RULE', title: 'Final rule', format: 'Circulars', ...fields });
const consultation = (fields: Partial<DatedNotice> = {}): DatedNotice => ({ type: 'CONSULTATION', title: 'Consultation on X', format: 'Consultations', ...fields });
const regulator = (...dates: SourceDate[]) => ({ sourceDates: dates });
const documentStates = (...dates: DocumentDate[]) => ({ keyPoints: { dates } });
const shown = (n: DatedNotice) => keyDate(n, TODAY)?.text;

test('comments still open come first, then the soonest date it takes effect or must be met', () => {
  assert.equal(shown(circular(regulator({ kind: 'takesEffect', date: '2026-11-01' }, { kind: 'closes', date: '2026-12-01' }))), 'Comments close: 2026-12-01');
  assert.equal(shown(circular(regulator({ kind: 'complyBy', date: '2027-06-30' }, { kind: 'takesEffect', date: '2027-01-01' }))), 'Takes effect: 2027-01-01');
  assert.equal(shown(circular(regulator({ kind: 'complyBy', date: '2026-11-30' }, { kind: 'takesEffect', date: '2027-01-01' }))), 'Comply by: 2026-11-30');
  // A date today is still ahead
  assert.equal(keyDate(circular(regulator({ kind: 'takesEffect', date: TODAY })), TODAY)?.upcoming, true);
});

test('badges: a closing date or date to comply by is a deadline, taking effect an action, a passed date neither', () => {
  assert.equal(keyDate(consultation(regulator({ kind: 'closes', date: '2026-11-01' })), TODAY)?.badge, 'deadline');
  assert.equal(keyDate(circular(regulator({ kind: 'complyBy', date: '2026-11-01' })), TODAY)?.badge, 'deadline');
  assert.equal(keyDate(circular(regulator({ kind: 'takesEffect', date: '2026-11-01' })), TODAY)?.badge, 'action');
  assert.equal(keyDate(circular(regulator({ kind: 'takesEffect', date: '2026-10-01' })), TODAY)?.badge, 'standard');
});

test('passed dates: comments closed, and the regulator\'s latest date it took effect or was to be met', () => {
  assert.equal(shown(consultation(regulator({ kind: 'closes', date: '2026-10-13' }))), 'Comments closed: 2026-10-13');
  assert.equal(shown(circular(regulator({ kind: 'takesEffect', date: '2026-09-01' }))), 'Took effect: 2026-09-01');
  assert.equal(shown(circular(regulator({ kind: 'complyBy', date: '2026-09-01' }))), 'Comply by: 2026-09-01 (passed)');
  assert.equal(shown(circular(regulator({ kind: 'takesEffect', date: '2026-08-01' }, { kind: 'complyBy', date: '2026-09-01' }))), 'Comply by: 2026-09-01 (passed)');
  // A closing date that has passed still comes before a date it took effect
  assert.equal(shown(circular(regulator({ kind: 'closes', date: '2026-08-01' }, { kind: 'takesEffect', date: '2026-09-01' }))), 'Comments closed: 2026-08-01');
  // A passed date the document states is history the reader can see in the dossier, not a key date
  assert.equal(shown(circular(documentStates({ kind: 'takesEffect', date: '2026-09-01', text: 'The rules took effect on 1 September 2026.' }))), undefined);
});

test('consultations and enforcement actions show no date to take effect, ahead or passed', () => {
  assert.equal(shown(consultation(regulator({ kind: 'takesEffect', date: '2027-01-01' }))), undefined);
  assert.equal(shown(circular({ format: 'Enforcement', ...regulator({ kind: 'takesEffect', date: '2026-09-01' }) })), undefined);
  assert.equal(shown(consultation(regulator({ kind: 'closes', date: '2026-11-01' }, { kind: 'takesEffect', date: '2027-01-01' }))), 'Comments close: 2026-11-01');
});

test('the regulator\'s dates come before those the document states', () => {
  const both = circular({
    ...regulator({ kind: 'takesEffect', date: '2026-12-01' }),
    ...documentStates({ kind: 'takesEffect', date: '2026-11-01', text: 'The rules take effect on 1 November 2026.' })
  });
  const d = keyDate(both, TODAY);
  assert.equal(d?.text, 'Takes effect: 2026-12-01');
  assert.equal(d?.from, 'regulator');
  assert.equal(d?.quote, undefined);
  const fromText = keyDate(circular(documentStates({ kind: 'takesEffect', date: '2026-11-01', text: 'The rules take effect on 1 November 2026.' })), TODAY);
  assert.equal(fromText?.from, 'document');
  assert.equal(fromText?.quote, 'The rules take effect on 1 November 2026.');
});

test('a round-up shows none of the dates its text quotes, but keeps those its regulator publishes', () => {
  const digest = { title: 'PRA Regulatory Digest – September 2026' };
  assert.equal(shown(circular({ ...digest, ...documentStates({ kind: 'takesEffect', date: '2027-01-01', text: 'The taxonomy will take effect from 1 January 2027.' }) })), undefined);
  assert.equal(shown(circular({ ...digest, ...regulator({ kind: 'takesEffect', date: '2027-01-01' }) })), 'Takes effect: 2027-01-01');
});

test('upcomingDate is the date shown only while it is ahead', () => {
  assert.equal(upcomingDate(consultation(regulator({ kind: 'closes', date: '2026-11-01' })), TODAY)?.date, '2026-11-01');
  assert.equal(upcomingDate(consultation(regulator({ kind: 'closes', date: '2026-10-20' })), TODAY), undefined);
  assert.equal(upcomingDate(circular(), TODAY), undefined);
});

test('today is the date in Hong Kong', () => {
  assert.equal(hongKongDate(new Date('2026-10-20T15:59:00Z')), '2026-10-20');
  assert.equal(hongKongDate(new Date('2026-10-20T16:00:00Z')), '2026-10-21');
});

test('copies stored with the old fields: the regulator\'s date is read back from the label it showed', () => {
  const legacy = (fields: object) => circular(fields as Partial<DatedNotice>);
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'Effective: 2026-12-01' })), [{ kind: 'takesEffect', date: '2026-12-01' }]);
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'Comments closed: 2026-05-22' })), [{ kind: 'closes', date: '2026-05-22' }]);
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'Comply by: 2030-07-01' })), [{ kind: 'complyBy', date: '2030-07-01' }]);
  // Labels that were never the regulator's date
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'No date published' })), []);
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'Date in source: 2098-01-01' })), []);
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'Takes effect: 2027-10-07', deadlineQuote: 'The Guidelines will take effect on 07 October 2027.' })), []);
  // The legacy closing date of the text: the regulator's only on a consultation
  const closingText = { closingDate: { text: 'The consultation closes on 14 October 2026.', date: '2026-10-14' } };
  assert.deepEqual(sourceDatesOf(legacy({ statutoryDeadline: 'Comments close: 2026-10-14', keyPoints: closingText })), []);
  assert.deepEqual(sourceDatesOf(consultation({ statutoryDeadline: 'Comments close: 2026-10-14', keyPoints: closingText } as Partial<DatedNotice>)), [{ kind: 'closes', date: '2026-10-14' }]);
  // sourceDates, once set, are what count
  assert.deepEqual(sourceDatesOf(legacy({ sourceDates: [], statutoryDeadline: 'Effective: 2026-12-01' })), []);
});

test('withoutLegacyDateFields drops the old fields and keeps the regulator\'s date', () => {
  const stored = { ...circular(), statutoryDeadline: 'Effective: 2026-09-01', deadlineDate: '2026-09-01', statusBadge: { text: 'Effective: 2026-09-01', type: 'action' } };
  const read = withoutLegacyDateFields(stored as DatedNotice);
  assert.deepEqual(read, { ...circular(), sourceDates: [{ kind: 'takesEffect', date: '2026-09-01' }] });
  assert.equal(shown(read), 'Took effect: 2026-09-01');
  const placeholder = withoutLegacyDateFields({ ...circular(), statutoryDeadline: 'No date published' } as DatedNotice);
  assert.deepEqual(placeholder, circular());
  // A current copy is returned as it is
  const current = circular(regulator({ kind: 'closes', date: '2026-11-01' }));
  assert.equal(withoutLegacyDateFields(current), current);
});

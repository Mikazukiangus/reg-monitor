import React from 'react';
import { useScheduledChecks } from '../hooks/useScheduledChecks';

const timestamp = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' SGT';
export function SourceFreshness({ lastSyncAt }: { lastSyncAt: string | null }) {
  const { status, unavailable } = useScheduledChecks(lastSyncAt);
  const latest = status?.latest;
  const summary = latest?.summary;
  return <details className="bg-panel border border-line rounded-lg px-3.5 py-2 text-[12px] text-muted">
    <summary className="cursor-pointer text-ink-soft">Scheduled source checks · {unavailable ? 'History unavailable' : !status ? 'Checking history…' : !status.enabled ? 'History not configured' : status.lastCompletedAt ? `Last completed ${timestamp(status.lastCompletedAt)}` : 'No completed check recorded yet'}</summary>
    <div className="mt-2 space-y-2">
      <p>Checks are scheduled every three hours. Feed refreshes are reported separately above.</p>
      {latest && <p>Latest check started {timestamp(latest.startedAt)}. {latest.status === 'running' ? 'Completion has not been recorded.' : latest.status === 'failed' ? 'The check failed.' : `Completed: ${summary?.sources.length ?? 0} sources read; ${summary?.failed.length ?? 0} errors.`}</p>}
      {!!summary?.failed.length && <ul className="space-y-1 break-words">{summary.failed.map(f => <li key={f.name}><strong className="text-ink-soft">{f.name}:</strong> {f.error}</li>)}</ul>}
      {status?.enabled && <p>FCA publication dates: {status.dateBackfill.pending} waiting for a page check; {status.dateBackfill.unresolved} checked without a date. {summary ? `${summary.pageDatesFound} dates found during the latest check.` : ''}</p>}
      {status?.enabled && status.queue && <p>Background jobs: {status.queue.waiting} waiting (documents to read for key points, or a digest to send again){status.queue.failed ? `; ${status.queue.failed} gave up this week` : ''}.</p>}
      {unavailable && <p>The server could not provide scheduled check history.</p>}
    </div>
  </details>;
}

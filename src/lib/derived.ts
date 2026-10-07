// Dashboard data computed from live notices, so every figure traces back to a
// source document.
import { AlertNotification, DeadlineItem, RegulatoryNotice } from '../types/regulatory';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(isoDate: string, now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - today) / DAY_MS);
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

// Upcoming dates from notices, soonest first
export function deriveDeadlines(notices: RegulatoryNotice[], now = new Date()): DeadlineItem[] {
  return notices
    .filter((n) => n.deadlineDate && daysUntil(n.deadlineDate, now) >= 0)
    .sort((a, b) => a.deadlineDate!.localeCompare(b.deadlineDate!))
    .map((n) => {
      const days = daysUntil(n.deadlineDate!, now);
      return {
        id: `deadline-${n.id}`,
        title: `${n.regulator}: ${n.title}`,
        subtitle: n.statutoryDeadline || 'Date in source',
        daysRemaining: days,
        dateStr: formatDate(n.deadlineDate!),
        colorClass: days <= 14 ? 'bg-venetian-wash' : 'bg-page',
        textColorClass: days <= 14 ? 'text-venetian' : days <= 60 ? 'text-ochre' : 'text-prussian',
        noticeId: n.id
      };
    });
}

export function sortNewestFirst(notices: RegulatoryNotice[]): RegulatoryNotice[] {
  return [...notices].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}

// Newest notices as alerts; published in the last 24 hours counts as unread
export function deriveNotifications(notices: RegulatoryNotice[], now = new Date()): AlertNotification[] {
  return sortNewestFirst(notices)
    .slice(0, 6)
    .map((n) => ({
      id: `notif-${n.id}`,
      title: n.title,
      regulator: n.regulator,
      time: n.issuedTimeAgo,
      severity: n.severity,
      unread: !!n.publishedAt && now.getTime() - new Date(n.publishedAt).getTime() < DAY_MS,
      linkId: n.id
    }));
}

// "4 min ago", "2 h ago", "3 d ago" for an ISO timestamp
export function timeAgo(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// Hong Kong / Singapore clock time, e.g. "13:20 SGT"
export function sgtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' }) + ' SGT';
}

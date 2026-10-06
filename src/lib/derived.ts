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
        colorClass: days <= 14 ? 'bg-[#FEF2F2]' : 'bg-[#FAF7F2]',
        textColorClass: days <= 14 ? 'text-[#DC2626]' : days <= 60 ? 'text-[#B45309]' : 'text-[#0D5C63]',
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

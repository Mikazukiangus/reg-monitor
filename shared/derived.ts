// Dashboard data computed from live notices, so every figure traces back to a
// source document.
import type { AlertNotification, DeadlineItem, JurisdictionCode, RegulatoryNotice } from './regulatory';
import { hongKongDate, upcomingDate } from './keyDate.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Future publication dates can be announced before the issue is published.
export function publicationTime(iso: string | undefined, now = new Date()): string {
  if (!iso || isNaN(new Date(iso).getTime())) return 'Date unavailable';
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 0) return `Scheduled for ${formatDate(iso.slice(0, 10))}`;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function publishedInLastDays(iso: string | undefined, days: number, now = new Date()): boolean {
  if (!iso) return false;
  const age = now.getTime() - new Date(iso).getTime();
  return age >= 0 && age <= days * DAY_MS;
}

export function localDay(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
    .flatMap((n) => {
      const shown = upcomingDate(n, hongKongDate(now));
      return shown && daysUntil(shown.date, now) >= 0 ? [{ n, shown }] : [];
    })
    .sort((a, b) => a.shown.date.localeCompare(b.shown.date))
    .map(({ n, shown }) => {
      const days = daysUntil(shown.date, now);
      return {
        id: `deadline-${n.id}`,
        title: `${n.regulator}: ${n.title}`,
        subtitle: shown.text,
        daysRemaining: days,
        dateStr: formatDate(shown.date),
        colorClass: days <= 14 ? 'bg-orange-wash' : 'bg-page',
        textColorClass: days <= 14 ? 'text-orange' : days <= 60 ? 'text-cream' : 'text-accent',
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
      unread: publishedInLastDays(n.publishedAt, 1, now),
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

// Each source's own time zone, for the calendar day it published on
const SOURCE_ZONE: Record<JurisdictionCode, string> = {
  SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', HK: 'Asia/Hong_Kong', CN: 'Asia/Shanghai',
  JP: 'Asia/Tokyo', KR: 'Asia/Seoul', AU: 'Australia/Sydney', US: 'America/New_York',
  UK_EU: 'Europe/London', GLOBAL: 'Europe/Zurich'
};

const zoneParts = (time: Date, timeZone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(time).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, midnight: parts.hour === '00' && parts.minute === '00' && parts.second === '00' };
};

// The day a notice was published, as the regulator dates it (YYYY-MM-DD).
// Sources that give only a date are stored as midnight, in the source's zone,
// UTC or Singapore depending on the source (and Central European time for
// some EU pages), so the zone where the time is midnight names the day. A
// full timestamp is read in the source's own zone.
export function publishedDay(iso: string | undefined, jurisdiction?: JurisdictionCode): string | undefined {
  const time = iso ? new Date(iso) : null;
  if (!time || isNaN(time.getTime())) return undefined;
  const own = jurisdiction ? SOURCE_ZONE[jurisdiction] : 'Asia/Singapore';
  for (const zone of [own, 'UTC', 'Asia/Singapore', 'Europe/Paris']) {
    const { day, midnight } = zoneParts(time, zone);
    if (midnight) return day;
  }
  return zoneParts(time, own).day;
}

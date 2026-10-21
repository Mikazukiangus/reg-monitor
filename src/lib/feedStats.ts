// The feed's headline figures and source status, worked out from the notices
// and endpoints loaded. Pure, so the rules are tested without the page.
import { hongKongDate, upcomingDate } from '../../shared/keyDate';
import type { EndpointMetric, EndpointStatus, RegulatoryNotice } from '../../shared/regulatory';
import { daysUntil, publishedInLastDays } from '../../shared/derived';
import { commentsClosed } from '../../shared/impact';

// "Last 7 days" and "closing soon" on the headline tiles
export const RECENT_DAYS = 7;
export const CLOSING_SOON_DAYS = 14;

export interface FeedFigures {
  total: number;
  critical: number;
  // Published in the last RECENT_DAYS days
  recent: number;
  // Consultations still open for comment, and those whose closing date has passed
  openConsultations: number;
  closedConsultations: number;
  // Consultations with a date in the next CLOSING_SOON_DAYS days
  closingSoon: number;
}

export function feedFigures(notices: RegulatoryNotice[], now = new Date()): FeedFigures {
  const consultations = notices.filter(n => n.format === 'Consultations');
  const openConsultations = consultations.filter(n => !commentsClosed(n, now)).length;
  return {
    total: notices.length,
    critical: notices.filter(n => n.severity === 'critical').length,
    recent: notices.filter(n => publishedInLastDays(n.publishedAt, RECENT_DAYS, now)).length,
    openConsultations,
    closedConsultations: consultations.length - openConsultations,
    closingSoon: consultations.filter(n => {
      const shown = upcomingDate(n, hongKongDate(now));
      if (!shown) return false;
      const d = daysUntil(shown.date, now);
      return d >= 0 && d <= CLOSING_SOON_DAYS;
    }).length
  };
}

// Notices from the stored history are older ones, so they never count as new
export function countNew(notices: RegulatoryNotice[], isNew: (id: string) => boolean): number {
  return notices.filter(n => !n.archived && isNew(n.id)).length;
}

// "SEC (via Federal Register)" → "SEC"
export const agencyName = (agency: string) => agency.replace(/ \(.*\)$/, '');

// Agencies whose notices were read in the latest sync
export function ingestingAgencies(endpoints: EndpointMetric[]): string[] {
  return endpoints.filter(ep => ep.ingests && ep.sync?.ok).map(ep => agencyName(ep.agency));
}

export interface EndpointHealth {
  up: EndpointMetric[];
  // Degraded or down; endpoints still being checked are neither
  issues: EndpointMetric[];
  checking: boolean;
  upPercent: number;
  // The overall state the tile shows
  overall: EndpointStatus;
}

export function endpointHealth(endpoints: EndpointMetric[]): EndpointHealth {
  const up = endpoints.filter(e => e.status === 'Operational');
  const issues = endpoints.filter(e => e.status !== 'Operational' && e.status !== 'Checking');
  const checking = endpoints.some(e => e.status === 'Checking');
  return {
    up,
    issues,
    checking,
    upPercent: percentOf(up.length, endpoints.length),
    overall: checking ? 'Checking' : issues.length === 0 ? 'Operational' : 'Degraded'
  };
}

// A whole-number share, 0 when there is nothing to share
export const percentOf = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

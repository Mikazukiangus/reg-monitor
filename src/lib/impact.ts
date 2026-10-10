// Impact score for a notice: a fixed rubric of what the document does, moved
// up or down by the dates it states. Every notice gets its score from this one
// function (live and stored ones, every source), with the reasons shown on the
// notice and the rubric tested in tests/impact.test.ts. It is not an
// assessment of how much a notice matters to any one firm.
//
// What the document does (first match wins):
//   Routine (data releases, events, appointments, speeches,
//     cooperation agreements, reports, paperwork notices)     3
//   SRO rule filing published by the SEC                      4
//   Consultation open for comment                             7
//   Enforcement action                                        7
//   Rules made (final rules, amendments, policy statements,
//     consultation conclusions, requirements taking effect,
//     China's department rules, measures and provisions)     7.5
//   Guidance                                                 6.5
//   Technical standards                                       6
//   Other circulars and announcements                         5
// Dates:
//   Comments close within 14 days                          +1.5
//   Comments closed                                   score 4
//   Takes effect within 30 days                            +1.5
//     (the Federal Register's effective date, or a date the document
//     states as when it takes effect)
//
// Critical (8.5 and up) is therefore only something with a date close at
// hand: a consultation about to close, or rules about to take effect.
import type { InstrumentFormat, UrgencySeverity } from '../types/regulatory';
import { CONCLUSION, SRO_FILING } from './tagging.js';

export const CRITICAL_SCORE = 8.5;
export const HIGH_SCORE = 6.5;

export const severityOf = (score: number): UrgencySeverity =>
  score >= CRITICAL_SCORE ? 'critical' : score >= HIGH_SCORE ? 'high' : 'info';

export interface ImpactInput {
  format: InstrumentFormat;
  type: string;
  title: string;
  statutoryDeadline?: string;
}

export interface ImpactAssessment {
  score: number;
  severity: UrgencySeverity;
  reasons: string[];
}

// [pattern, what it is, whether it can apply to a consultation]
const ROUTINE: [RegExp, string, boolean?][] = [
  [/\b(international|foreign currency) reserves?\b|\breserve assets figures\b|\bbalance sheet\b|\bsurvey results?\b|\bresults? of the tender\b|\binterest rate of .* payment\b|\bstatistics\b|\b(monetary|economic) and financial developments\b|\btrends in\b|\bstatus of loans\b|\bbanknotes?\b|\bcoin collection\b/i, 'a data release'],
  [/\binformation collection\b|\bpaperwork reduction\b|\bomb review\b|\bsunshine act\b/i, 'a paperwork notice', true],
  [/\b(re)?appoint(s|ed|ment|ments)?\b|\bleadership changes\b|\bnew (chair|chief executive|ceo|member)\b/i, 'an appointment'],
  [/^(new )?(keynote|opening|welcome|closing|speech|remarks|address)\b|\b(keynote|speech|remarks|address) by\b|\bnew speech\b|\bfireside chat\b/i, 'a speech'],
  [/\b(conference|summit|symposium|forum|festival|roundtable|roadshow|awards?|anniversary|solution day|showcase|webinar|seminar)\b|\bhosts?\b|\bholds? (its |a )?(\w+ )?meetings?\b|を開催しました|が開催されました|会议召开|召开|举行/i, 'an event'],
  [/\bmemorand(um|a) of (understanding|cooperation)\b|\bmou\b|\bstrengthen(s|ing)? (bilateral |regional )?(cooperation|collaboration|ties)\b|\bswap arrangement\b|\bcooperation agreement\b|\bjoint statement\b/i, 'a cooperation agreement or joint statement'],
  [/\bannual (financial )?report\b|\bregulatory digest\b|\bnewsletter\b|\bcomplaints watch\b|\bhalf-yearly\b/i, 'a periodic report']
];

const RULES_MADE = /\bfinal rules?\b|(?<!monetary )\bpolicy statements?\b|\bPS\d{1,2}\/\d{2}\b|\bconsultation conclusions?\b|\bresponse to (the )?consultation\b|\bfeedback statement\b|\bresponse paper\b|\btakes? effect\b|\bto take effect\b|\bcomes? into (force|effect)\b|\b(has |have )?amended\b|\bamendments? to\b|\brevisions? to\b|\brevised\b|\bupdate to notice\b|\bfinalis(ed|es|ation)\b|\bnew (rules|requirements|listing rules|framework)\b|\bimplement(s|ing)? new\b|\bto implement\b|\brule changes to\b|\bissues? (new |revised )?(notice|rules|regulations)\b|\bdepartment rules\b|办法|规定|条例/i;

// Base scores by what the document does, for each format
const BASE: Record<InstrumentFormat, [number, string]> = {
  Consultations: [7, 'consultation open for comment'],
  Enforcement: [7, 'enforcement action'],
  Guidelines: [6.5, 'guidance'],
  'Technical Standards': [6, 'technical standards'],
  Circulars: [5, 'circular'],
  Announcements: [5, 'announcement']
};

const DAY = 86_400_000;

// Whole days from today (UTC) to a YYYY-MM-DD date
function daysFrom(today: Date, date: string): number {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((Date.parse(`${date}T00:00:00Z`) - start) / DAY);
}

// Whether a consultation's comment period has ended, by the closing date it
// states (a consultation without one is treated as open)
export function commentsClosed(statutoryDeadline: string | undefined, today = new Date()): boolean {
  const m = statutoryDeadline?.match(/^Comments closed?: (\d{4}-\d{2}-\d{2})/);
  return !!m && daysFrom(today, m[1]) < 0;
}

export function assessImpact(n: ImpactInput, today = new Date()): ImpactAssessment {
  const text = `${n.type} ${n.title}`;
  const deadline = n.statutoryDeadline?.match(/^(Comments close|Comments closed|Effective|Takes effect): (\d{4}-\d{2}-\d{2})/);
  const result = (score: number, reasons: string[]): ImpactAssessment => ({ score, severity: severityOf(score), reasons });

  for (const [pattern, label, forConsultations] of ROUTINE) {
    const m = n.title.match(pattern);
    // Enforcement is never routine, and a consultation only when it is paperwork
    if (m && n.format !== 'Enforcement' && (n.format !== 'Consultations' || forConsultations)) {
      return result(3, [`${label} ("${m[0]}"): 3`]);
    }
  }
  if (SRO_FILING.test(n.title)) {
    return result(4, ['a self-regulatory organisation\'s rule filing, published by the SEC: 4']);
  }

  let score: number;
  const reasons: string[] = [];
  const made = n.format === 'Enforcement' || n.format === 'Consultations' ? null
    : text.match(CONCLUSION) || text.match(RULES_MADE) || (/^RULE\b/.test(n.type) ? ['a final rule in the Federal Register'] : null);
  if (made) {
    score = 7.5;
    reasons.push(`rules made ("${made[0]}"): 7.5`);
  } else {
    const [base, label] = BASE[n.format];
    score = base;
    reasons.push(`${label}: ${base}`);
  }

  if (deadline) {
    const [, kind, date] = deadline;
    const days = daysFrom(today, date);
    if (kind.startsWith('Comments') && n.format === 'Consultations') {
      if (days < 0) {
        score = 4;
        reasons.push(`comments closed on ${date}: 4`);
      } else if (days <= 14) {
        score += 1.5;
        reasons.push(`comments close ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}: +1.5`);
      }
    } else if ((kind === 'Effective' || kind === 'Takes effect') && days >= 0 && days <= 30) {
      score += 1.5;
      reasons.push(`takes effect ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}: +1.5`);
    }
  }
  return result(score, reasons);
}

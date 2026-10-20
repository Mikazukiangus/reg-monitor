// The daily digest as an email: subject, HTML and plain text. Colours are
// written out because email clients ignore the site's stylesheet.
import { SGT, type DigestMatch } from './match.js';

function longDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Date only: several sources publish a date without a time
function sgtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: SGT });
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderDigest(matches: DigestMatch[], day: string, siteUrl: string, failedSources: string[] = []) {
  const count = matches.length;
  const subject = `RegSonar: ${count} new notice${count === 1 ? '' : 's'} matching your rules (${longDate(day)})`;
  const footer = [
    `Notices published on ${longDate(day)}, Singapore time, that match the rules in digest-rules.ts.`,
    'Rules match the regulator, impact score and keywords in the title, summary and any key points already loaded; impact scores follow a fixed rubric of what the document does and the dates it states (see How It Works).',
    'Quotes are taken word for word from the source document. Check the document before relying on a date.',
    ...(failedSources.length ? [`Could not be read for this email: ${failedSources.join(', ')}.`] : [])
  ];

  const text = [
    subject,
    '',
    ...matches.flatMap(({ notice: n, rules }) => [
      `${n.regulator}: ${n.title}`,
      `${n.ref} · published ${sgtDate(n.publishedAt!)} · matched: ${rules.join(', ')}`,
      ...(n.deadlineDate ? [`${n.statutoryDeadline || 'Date'} (as stated in the source)`] : []),
      ...(n.keyPoints?.points[0] ? [`"${n.keyPoints.points[0]}"`] : []),
      n.dossierUrl || '',
      ''
    ]),
    ...footer,
    `Open RegSonar: ${siteUrl}`
  ].join('\n');

  const items = matches.map(({ notice: n, rules }) => `
    <tr><td style="padding:14px 0;border-top:1px solid #D3DDD7">
      <div style="font:600 11px/1.4 Menlo,Consolas,monospace;color:#56636B;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(n.regulator)} · ${escapeHtml(n.ref)}</div>
      <div style="font:600 16px/1.35 Helvetica,Arial,sans-serif;margin:4px 0">
        ${n.dossierUrl ? `<a href="${escapeHtml(n.dossierUrl)}" style="color:#1F4E79;text-decoration:none">${escapeHtml(n.title)}</a>` : escapeHtml(n.title)}
      </div>
      <div style="font:13px/1.5 Helvetica,Arial,sans-serif;color:#3C4852">
        Published ${escapeHtml(sgtDate(n.publishedAt!))} · Matched: ${escapeHtml(rules.join(', '))}
        ${n.deadlineDate ? `<br><strong style="color:#A8432F">${escapeHtml(n.statutoryDeadline || `Date: ${n.deadlineDate}`)}</strong> (as stated in the source)` : ''}
      </div>
      ${n.keyPoints?.points[0] ? `<blockquote style="margin:8px 0 0;padding:6px 10px;border-left:3px solid #1F4E79;background:#E3EBE6;font:13px/1.5 Helvetica,Arial,sans-serif;color:#1D2630">“${escapeHtml(n.keyPoints.points[0])}”</blockquote>` : ''}
    </td></tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#EEF3EF">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3EF"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FBFCFA;border:1px solid #D3DDD7;border-radius:10px">
      <tr><td style="padding:20px 24px 4px">
        <div style="font:700 20px/1.3 Helvetica,Arial,sans-serif;color:#1D2630">${count} new notice${count === 1 ? '' : 's'} matching your rules</div>
        <div style="font:13px/1.5 Helvetica,Arial,sans-serif;color:#56636B">${escapeHtml(longDate(day))}, Singapore time</div>
      </td></tr>
      <tr><td style="padding:8px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>
      <tr><td style="padding:14px 24px 22px;border-top:1px solid #D3DDD7;font:12px/1.5 Helvetica,Arial,sans-serif;color:#56636B">
        ${footer.map(escapeHtml).join('<br>')}<br><a href="${escapeHtml(siteUrl)}" style="color:#1F4E79">Open RegSonar</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  return { subject, html, text };
}

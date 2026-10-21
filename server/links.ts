// Links between consultations and their outcomes, stored in the history
// (notice_links) so every notice the site serves can show them. Notices the
// feed reads are matched (shared/related.ts) against the whole history of
// their regulator when they are saved, and each scheduled check rebuilds every
// link once it has saved what it read, so a change to the matching reaches
// the whole history.
import { linkPairs, isConclusion, isConsultation } from '../shared/related.js';
import type { NoticeStore } from './store.js';
import type { NormalizedNotice } from './notice.js';

// Link notices just saved to the stored consultations or outcomes they match
export async function linkSaved(notices: NormalizedNotice[], store: NoticeStore): Promise<void> {
  const linkable = notices.filter(n => isConclusion(n.title) || isConsultation(n));
  if (linkable.length === 0) return;
  const candidates = await store.linkCandidates([...new Set(linkable.map(n => n.regulator))]);
  await store.addLinks(linkPairs(candidates, new Set(linkable.map(n => n.id))));
}

// Match the whole history again and store exactly those links; returns how many
export async function relinkAll(store: NoticeStore): Promise<number> {
  const links = linkPairs(await store.linkCandidates());
  await store.replaceLinks(links);
  return links.length;
}

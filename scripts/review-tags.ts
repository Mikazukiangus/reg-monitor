// Lists the live notices whose tags rest on the weakest evidence, for a person
// to check by eye: `npm run tags:review` (add a number to read more per source).
// When one is wrong, add it to tests/tagging.test.ts with the right answer and
// change the rules in src/lib/tagging.ts until every test passes.
process.env.VERCEL = '1';

const { SOURCES } = await import('../server.ts');
const { classifySectors } = await import('../src/lib/tagging.ts');

const perSource = Number(process.argv[2]) || 20;
const fallback: string[] = [];
const textOnly: string[] = [];
const noFormatWords: string[] = [];
let total = 0;

for (const source of SOURCES) {
  if (source.inDigest === false) continue;
  let notices;
  try {
    notices = await source.fetch(perSource);
  } catch (err) {
    console.error(`${source.name}: not read (${(err as Error).message})`);
    continue;
  }
  for (const n of notices) {
    total++;
    const line = `- [${n.regulator}] ${n.title}\n  ${n.dossierUrl}`;
    const tagging = n.tagging;
    if (!tagging) continue;
    if (tagging.sectorFallback) {
      fallback.push(`${line}\n  → ${n.sectors?.join(', ')} (${tagging.sectorFallback})`);
      continue;
    }
    // Sectors the title alone does not give came from summary or key-point words
    const fromTitle = new Set(classifySectors({ title: n.title, regulator: n.regulator }).sectors);
    const weak = (n.sectors ?? []).filter(s => !fromTitle.has(s));
    if (weak.length) {
      textOnly.push(`${line}\n  → ${weak.map(s => `${s} (${tagging.sectors[s]?.join(', ')})`).join('; ')}`);
    }
    if (tagging.format === 'no format words matched' && n.format === 'Circulars') noFormatWords.push(line);
  }
}

const section = (heading: string, note: string, lines: string[]) =>
  console.log(`\n## ${heading} (${lines.length})\n${note}\n\n${lines.join('\n') || '- none'}`);

console.log(`# Tags to check: ${total} live notices read, up to ${perSource} per source`);
section('No topic words', 'Tagged by default. Is there a sector the rules should have found?', fallback);
section('Sector from the summary only', 'The title gave no sign of these sectors. Are they right?', textOnly);
section('Circular by default', 'No format words matched. Is any of these a consultation, enforcement action or guideline?', noFormatWords);

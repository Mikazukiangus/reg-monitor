// Fetch the latest HKMA daily interbank liquidity figures and save them to
// data/hkma-liquidity.json. Run by the scheduled GitHub Actions workflow,
// because the HKMA Open API's firewall blocks Vercel's servers. One request
// per run (one retry on failure) keeps well inside the API's rate limits.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity?pagesize=1';
const OUT = new URL('../data/hkma-liquidity.json', import.meta.url);
const REQUIRED = ['end_of_date', 'closing_balance', 'hibor_overnight', 'hibor_fixing_1m', 'disc_win_base_rate'];

async function fetchRecord() {
  const res = await fetch(SOURCE, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'RegSonar-Scheduled-Job (github.com/Mikazukiangus/reg-monitor)', Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rec = data.result?.records?.[0];
  if (!data.header?.success || !rec) throw new Error(`HKMA API error ${data.header?.err_code}: ${data.header?.err_msg}`);
  const missing = REQUIRED.filter(k => rec[k] === undefined || rec[k] === null);
  if (missing.length) throw new Error(`Record is missing ${missing.join(', ')}`);
  return rec;
}

let record;
try {
  record = await fetchRecord();
} catch (err) {
  console.log(`First attempt failed (${err.message}); retrying in 60s`);
  await new Promise(r => setTimeout(r, 60_000));
  record = await fetchRecord();
}

const previous = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null);
if (previous?.record?.end_of_date === record.end_of_date) {
  console.log(`No new figures (latest is still ${record.end_of_date})`);
} else {
  const snapshot = { source: SOURCE, fetchedAt: new Date().toISOString(), record };
  await mkdir(new URL('.', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Saved figures for ${record.end_of_date}`);
}

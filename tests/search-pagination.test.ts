// History search a page at a time (keyset pagination on rank, date and id):
// every match exactly once and in order, pages that do not shift when new
// matches arrive, and cursors and limits checked at the edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.DATABASE_URL = 'pglite';
const { getDb, saveNotices } = await import('../server/db.ts');
const { createApp } = await import('../server/app.ts');
const { encodeCursor } = await import('../server/cursor.ts');

// Ranks vary with how often the word appears; some share a rank and a date,
// and some have no date, so every tie-break is used
const notice = (i: number, extra = {}) => ({
  id: `liq-${String(i).padStart(3, '0')}`, ref: `R${i}`, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CIRCULAR', format: 'Circulars', impactScore: 5, issuedTimeAgo: '', tags: [], sector: 'Banking & Prudential',
  sectors: ['Banking & Prudential'], severity: 'info', typeColorClass: { bg: '', text: '' },
  title: `Circular ${i} on liquidity`, summary: Array(1 + (i % 4)).fill('liquidity').join(' '),
  dossierUrl: `https://www.mas.gov.sg/liq/${i}`,
  ...(i % 7 === 0 ? {} : { publishedAt: new Date(Date.UTC(2026, 9, 1 + (i % 5))).toISOString() }),
  ...extra
});

async function serve(run: (search: (params: string) => Promise<Response>) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/notices/search`;
  try {
    await run(params => fetch(`${base}?${params}`));
  } finally {
    server.close();
  }
}

async function allPages(search: (params: string) => Promise<Response>, q: string, limit: number) {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 20; pages++) {
    const res = await search(`q=${q}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    ids.push(...body.notices.map((n: { id: string }) => n.id));
    cursor = body.nextCursor;
    if (!cursor) return { ids, pages: pages + 1 };
  }
  throw new Error('no last page');
}

test('pages give every match once, in the order of one long page', async () => {
  const db = (await getDb())!;
  await saveNotices(db, Array.from({ length: 95 }, (_, i) => notice(i)) as any);
  await serve(async search => {
    const whole = await (await search('q=liquidity&limit=100')).json();
    assert.equal(whole.notices.length, 95);
    assert.equal(whole.nextCursor, null);
    const paged = await allPages(search, 'liquidity', 40);
    assert.equal(paged.pages, 3);
    assert.deepEqual(paged.ids, whole.notices.map((n: { id: string }) => n.id));
    // Without a limit, pages of 40
    const first = await (await search('q=liquidity')).json();
    assert.equal(first.notices.length, 40);
    assert.equal(typeof first.nextCursor, 'string');
  });
});

test('a match that arrives between pages does not shift the next page', async () => {
  const db = (await getDb())!;
  await saveNotices(db, Array.from({ length: 30 }, (_, i) => notice(i, { id: `stable-${String(i).padStart(2, '0')}`, title: `Notice ${i} on stablecoins`, summary: 'stablecoins', dossierUrl: `https://www.mas.gov.sg/stable/${i}` })) as any);
  await serve(async search => {
    const first = await (await search('q=stablecoins&limit=10')).json();
    // A new notice that ranks first, as if a source refresh saved it now
    await saveNotices(db, [notice(999, { id: 'stable-new', title: 'Stablecoins stablecoins', summary: 'stablecoins stablecoins stablecoins', dossierUrl: 'https://www.mas.gov.sg/stable/new' })] as any);
    let ids = first.notices.map((n: { id: string }) => n.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await (await search(`q=stablecoins&limit=10&cursor=${cursor}`)).json();
      ids = ids.concat(page.notices.map((n: { id: string }) => n.id));
      cursor = page.nextCursor;
    }
    // The 30 that were there, each once; the new one is on a first page asked for now
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    assert.ok(!ids.includes('stable-new'));
    assert.equal((await (await search('q=stablecoins&limit=10')).json()).notices[0].id, 'stable-new');
  });
});

test('a cursor or limit the server did not make is refused', async () => {
  await serve(async search => {
    for (const params of ['cursor=not-a-cursor', `cursor=${Buffer.from('["1","x","id"]').toString('base64url')}`,
      `cursor=${Buffer.from('{"rank":"1"}').toString('base64url')}`, 'limit=0', 'limit=101', 'limit=ten']) {
      const res = await search(`q=liquidity&${params}`);
      assert.equal(res.status, 400, params);
      assert.match((await res.json()).error, /^(cursor must be the nextCursor of an earlier page|limit must be a whole number from 1 to 100)$/);
    }
    // A well-formed cursor is only a starting point: one past every match gives an empty last page
    const end = encodeCursor({ rank: '0', publishedAt: '-infinity', id: '' });
    assert.equal((await search(`q=liquidity&cursor=${end}`)).status, 400, 'an empty id is not a cursor');
    const past = encodeCursor({ rank: '0', publishedAt: '-infinity', id: 'a' });
    const body = await (await search(`q=liquidity&cursor=${past}`)).json();
    assert.deepEqual([body.notices.length, body.nextCursor], [0, null]);
  });
});

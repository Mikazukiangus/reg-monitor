// Limits on the work a visitor can make the server do (src/lib/throttle.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, reuseFor } from '../src/lib/throttle.ts';

test('a built result is reused until it is a minute old', async () => {
  let builds = 0;
  const get = reuseFor(60_000, async () => ++builds);
  const start = Date.now();
  assert.equal(await get(start), 1);
  assert.equal(await get(start + 59_000), 1);
  assert.equal(await get(start + 61_000), 2);
});

test('calls while a build is running share that build', async () => {
  let builds = 0;
  let finish!: () => void;
  const get = reuseFor(60_000, () => new Promise<number>(resolve => { finish = () => resolve(++builds); }));
  const both = Promise.all([get(), get()]);
  finish();
  assert.deepEqual(await both, [1, 1]);
});

test('a failed build is not kept', async () => {
  let calls = 0;
  const get = reuseFor(60_000, async () => {
    if (++calls === 1) throw new Error('source down');
    return calls;
  });
  await assert.rejects(get());
  assert.equal(await get(), 2);
});

test('each visitor gets a few refreshes a minute, counted separately', () => {
  const limit = rateLimit(3, 60_000);
  const t = 1_000_000;
  assert.equal(limit('a', t), 0);
  assert.equal(limit('a', t + 1000), 0);
  assert.equal(limit('a', t + 2000), 0);
  // The fourth waits until the first is a minute old
  assert.equal(limit('a', t + 3000), 57);
  assert.equal(limit('b', t + 3000), 0);
  assert.equal(limit('a', t + 60_001), 0);
});

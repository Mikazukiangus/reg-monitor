// The scheduled jobs' secret (server/routes/cron.ts): off without one or with
// one too short to resist guessing; otherwise only the exact bearer header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronRefusal, MIN_CRON_SECRET_LENGTH } from '../server/routes/cron.ts';

const STRONG = 'a3f9c2e8b1d7406f9e5a2c8b7d1e4f60'; // 32 characters
const WHAT = 'scheduled checks are';

test('without a secret, or with one under 32 characters, the jobs are off for everyone', () => {
  assert.equal(MIN_CRON_SECRET_LENGTH, 32);
  assert.deepEqual(cronRefusal(undefined, `Bearer ${STRONG}`, WHAT), { status: 503, error: 'CRON_SECRET is not set, so scheduled checks are turned off' });
  const short = STRONG.slice(0, 31);
  // Even the right header is refused: a short secret could have been guessed
  assert.deepEqual(cronRefusal(short, `Bearer ${short}`, WHAT), { status: 503, error: 'CRON_SECRET is shorter than 32 characters, so scheduled checks are turned off' });
});

test('with a strong secret only the exact bearer header runs a job', () => {
  assert.equal(cronRefusal(STRONG, `Bearer ${STRONG}`, WHAT), null);
  for (const header of ['', STRONG, `bearer ${STRONG}`, `Bearer ${STRONG} `, `Bearer ${STRONG.slice(0, 31)}`, `Bearer ${STRONG}x`, `Basic ${STRONG}`]) {
    assert.deepEqual(cronRefusal(STRONG, header, WHAT), { status: 401, error: 'Unauthorized' }, JSON.stringify(header));
  }
});

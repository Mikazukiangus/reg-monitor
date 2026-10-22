// CI (.github/workflows/ci.yml): skipped for Markdown-only changes, and the
// audit (scripts/ci-audit.sh) tried again when npm's audit service does not
// answer, never when it reports vulnerabilities. Run against a stand-in npm
// that replays npm's own output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const OUTAGE = [
  'npm warn audit 503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Service Unavailable',
  "{ error: 'Service Unavailable' }",
  'npm error audit endpoint returned an error'
].join('\n');
const CLEAN = 'found 0 vulnerabilities';
const MIXED = '# npm audit report\n\nexample  <1.2.3\nSeverity: high\nfix available via `npm audit fix`\n\n3 vulnerabilities (1 moderate, 2 high)';
const HIGH = 'example  <1.2.3\nSeverity: high\n\n2 high severity vulnerabilities';

// Runs the script with npm answering each call with the next reply
function audit(replies: { output: string; code: number }[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-audit-'));
  replies.forEach((r, i) => writeFileSync(path.join(dir, `reply-${i + 1}`), `${r.code}\n${r.output}\n`));
  writeFileSync(path.join(dir, 'calls'), '0');
  const npm = path.join(dir, 'npm');
  writeFileSync(npm, [
    '#!/usr/bin/env bash',
    `n=$(( $(cat "${dir}/calls") + 1 )); echo $n > "${dir}/calls"`,
    `reply="${dir}/reply-$n"`,
    'tail -n +2 "$reply"',
    'exit "$(head -n 1 "$reply")"'
  ].join('\n'));
  chmodSync(npm, 0o755);
  const run = spawnSync('bash', ['scripts/ci-audit.sh'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AUDIT_RETRY_DELAY: '0' }
  });
  return { code: run.status, output: run.stdout + run.stderr, calls: Number(readFileSync(path.join(dir, 'calls'), 'utf8')) };
}

test('the audit passes when npm finds nothing', () => {
  const r = audit([{ output: CLEAN, code: 0 }]);
  assert.deepEqual([r.code, r.calls], [0, 1]);
  assert.match(r.output, /found 0 vulnerabilities/);
});

test('the audit tries again when npm\'s audit service does not answer', () => {
  const r = audit([{ output: OUTAGE, code: 1 }, { output: OUTAGE, code: 1 }, { output: CLEAN, code: 0 }]);
  assert.deepEqual([r.code, r.calls], [0, 3]);
  assert.match(r.output, /::warning::npm's audit service did not answer \(attempt 1 of 3\)/);
  assert.match(r.output, /attempt 2 of 3/);
});

test('the audit fails after three attempts without an answer, saying it is not a finding', () => {
  const r = audit([{ output: OUTAGE, code: 1 }, { output: OUTAGE, code: 1 }, { output: OUTAGE, code: 1 }]);
  assert.deepEqual([r.code, r.calls], [1, 3]);
  assert.match(r.output, /::error::npm's audit service did not answer after 3 attempts; this is not a finding/);
});

test('vulnerabilities fail the audit at once, without trying again', () => {
  for (const report of [MIXED, HIGH]) {
    const r = audit([{ output: report, code: 1 }, { output: CLEAN, code: 0 }]);
    assert.deepEqual([r.code, r.calls], [1, 1], report);
    assert.doesNotMatch(r.output, /::warning::/);
  }
});

test('CI skips Markdown-only changes and runs the retrying audit', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const event of ['push', 'pull_request']) {
    assert.match(ci, new RegExp(`\\n  ${event}:\\n    paths-ignore:\\n      - '\\*\\*\\.md'\\n`), event);
  }
  assert.match(ci, /\n      - run: scripts\/ci-audit\.sh\n/);
  assert.doesNotMatch(ci, /run: npm audit/);
  // The same rule as Vercel's: builds are skipped for Markdown-only changes
  assert.match(JSON.parse(readFileSync('vercel.json', 'utf8')).ignoreCommand, /':\(exclude\)\*\.md'/);
});

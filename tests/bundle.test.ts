// What Vercel deploys: the files the API function needs beyond what Vercel
// traces itself (vercel.json includeFiles), and when a push is not built at
// all (vercel.json ignoreCommand). Each deployment keeps its own copy of the
// function, so the bundle is kept to what OCR loads, and pushes that change
// only Markdown files (the project log) build nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const includeFiles: string = vercel.functions['api/index.ts'].includeFiles;
// node_modules/... paths, relative to the project, as Vercel matches them
const bundled = (file: string) => path.matchesGlob(file, includeFiles);

test('includeFiles fits the 256 characters vercel.json allows', () => {
  assert.ok(includeFiles.length <= 256, `${includeFiles.length} characters`);
});

// tesseract.js picks one of these by what the processor supports. In Node,
// version 7 asks for the builds without "-lstm" even in LSTM mode (it compares
// a true/false flag with the mode numbers), so both kinds are kept, each as
// .js and the .wasm it reads.
test('every OCR engine build tesseract.js can load in Node is in the function', () => {
  const getCore = readFileSync('node_modules/tesseract.js/src/worker-script/node/getCore.js', 'utf8');
  const builds = [...getCore.matchAll(/require\('tesseract\.js-core\/([\w-]+)'\)/g)].map(m => m[1]);
  assert.equal(builds.length, 6, 'getCore names six builds');
  for (const build of builds) {
    assert.ok(bundled(`node_modules/tesseract.js-core/${build}.js`), `${build}.js`);
    assert.ok(bundled(`node_modules/tesseract.js-core/${build}.wasm`), `${build}.wasm`);
    // The same engine packed for browsers, which Node never loads
    assert.ok(!bundled(`node_modules/tesseract.js-core/${build}.wasm.js`), `${build}.wasm.js is left out`);
  }
});

test('the English model OCR uses is in the function, and the unused one is not', async () => {
  const { OCR_LANG_PATH } = await import('../server/extract.ts');
  const model = path.relative(process.cwd(), path.join(OCR_LANG_PATH, 'eng.traineddata.gz'));
  assert.ok(bundled(model), model);
  assert.ok(!bundled('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'));
});

test('OCR reads an image of printed text', async () => {
  const { createOcrWorker } = await import('../server/extract.ts');
  const worker = await createOcrWorker();
  try {
    const { data } = await worker.recognize(readFileSync('tests/fixtures/ocr-sample.png'));
    assert.match(data.text, /Comments close on 30 November 2026\./);
  } finally {
    await worker.terminate();
  }
});

// ignoreCommand exits 0 to skip a build. VERCEL_GIT_PREVIOUS_SHA is the commit
// of the branch's last successful deployment.
test('a push is built unless only Markdown files changed since the last deployment', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'ignore-command-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = (file: string, text: string) => {
    writeFileSync(path.join(repo, file), text);
    git('add', file);
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', file);
    return git('rev-parse', 'HEAD');
  };
  const skipped = (previous: string) =>
    spawnSync('sh', ['-c', vercel.ignoreCommand], { cwd: repo, env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous } }).status === 0;
  try {
    git('init', '-q');
    const deployed = commit('server.ts', 'v1');
    // A log update only
    commit('LOG.md', 'entry');
    assert.equal(skipped(deployed), true, 'Markdown only: skipped');
    // A merge that brings code and ends with a log update
    const withCode = commit('server.ts', 'v2');
    commit('LOG.md', 'another entry');
    assert.equal(skipped(deployed), false, 'code since the last deployment: built');
    assert.equal(skipped(withCode), true);
    // A redeploy of the commit already deployed, a branch's first deployment,
    // and a last deployment the clone does not have are always built
    assert.equal(skipped(git('rev-parse', 'HEAD')), false, 'same commit: built');
    assert.equal(skipped(''), false, 'no previous deployment: built');
    assert.equal(skipped('0123456789abcdef0123456789abcdef01234567'), false, 'unknown commit: built');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

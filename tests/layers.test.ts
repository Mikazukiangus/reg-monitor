// Which code may import which: shared/ (rules both sides use) imports only
// itself, the browser code in src/ never reaches the server, and the server
// takes nothing from src/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));

// Every module a file imports, as a path from the project root (or the package name)
function imports(file: string): string[] {
  const specs = [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  return specs.map(s => (s.startsWith('.') ? path.normalize(path.join(path.dirname(file), s)) : s));
}

test('shared code imports only other shared code', () => {
  const outside = files('shared').flatMap(f => imports(f).filter(i => !i.startsWith('shared/')).map(i => `${f} -> ${i}`));
  assert.deepEqual(outside, []);
});

test('browser code never imports the server, its configuration or its logger', () => {
  const server = /^(server\/|server$|runtime-config|config|digest-rules|api\/)/;
  const reaches = files('src').flatMap(f => imports(f).filter(i => server.test(i)).map(i => `${f} -> ${i}`));
  assert.deepEqual(reaches, []);
});

test('server code takes nothing from the browser code', () => {
  const reaches = [...files('server'), ...files('api'), 'server.ts', 'digest-rules.ts']
    .flatMap(f => imports(f).filter(i => i.startsWith('src/')).map(i => `${f} -> ${i}`));
  assert.deepEqual(reaches, []);
});

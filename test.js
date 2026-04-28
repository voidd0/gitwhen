/* gitwhen — smoke tests against the secscan repo (a known git repo on this VPS).
   Run via: node test.js
   Skips network/repo-dependent tests if /root/voiddo-tools/secscan is missing. */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('node:child_process');
const os = require('os');
const {
  parseLineSpec, searchString, blameLine, fileLifespan, ensureGitRepo,
} = require('./src/index');

let passed = 0, failed = 0;
function eq(label, a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) { console.log('  ok  ' + label); passed++; }
  else { console.log('  FAIL ' + label); console.log('     actual:   ' + JSON.stringify(a)); console.log('     expected: ' + JSON.stringify(b)); failed++; }
}
function truthy(label, v) { if (v) { console.log('  ok  ' + label); passed++; } else { console.log('  FAIL ' + label); failed++; } }

console.log('parseLineSpec:');
eq('basic',           parseLineSpec('foo.js:42'),                { file: 'foo.js', line: 42 });
eq('nested path',     parseLineSpec('src/server/index.ts:120'),  { file: 'src/server/index.ts', line: 120 });
eq('no match',        parseLineSpec('justastring'),               null);
eq('trailing colon',  parseLineSpec('foo.js:'),                   null);

console.log('\nensureGitRepo:');
{
  let threw = false;
  try { ensureGitRepo(os.tmpdir()); } catch (_) { threw = true; }
  truthy('throws outside repo',  threw);
}

// Build a tiny throwaway git repo so we can test the full surface
// without depending on whatever happens to live on disk.
console.log('\nfull-stack against disposable repo:');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitwhen-test-'));
function git(args) {
  return cp.execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
git(['init', '-q', '-b', 'main']);
git(['config', 'user.email', 't@t.local']);
git(['config', 'user.name', 'tester']);
fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello\nworld\n');
git(['add', 'a.txt']);
git(['commit', '-q', '-m', 'initial']);
fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello\nworld\nMARKER_TOKEN_123\n');
git(['add', 'a.txt']);
git(['commit', '-q', '-m', 'add MARKER_TOKEN_123']);
fs.writeFileSync(path.join(tmp, 'b.txt'), 'second file\n');
git(['add', 'b.txt']);
git(['commit', '-q', '-m', 'add b.txt']);
fs.unlinkSync(path.join(tmp, 'b.txt'));
git(['add', '-A']);
git(['commit', '-q', '-m', 'remove b.txt']);

{
  const r = searchString('MARKER_TOKEN_123', { cwd: tmp });
  truthy('searchString found commit',  r.count >= 1);
  truthy('first commit has hash',      r.commits[0] && /^[0-9a-f]{40}$/.test(r.commits[0].hash));
  truthy('has author "tester"',        r.commits[0] && r.commits[0].author === 'tester');
  truthy('subject contains MARKER',    r.commits[0] && r.commits[0].subject.includes('MARKER'));
}

{
  const b = blameLine('a.txt', 3, { cwd: tmp });
  eq('blame file',      b.file,    'a.txt');
  eq('blame line',      b.line,    3);
  truthy('blame author',           b.author === 'tester');
  truthy('blame content right',    b.content && b.content.startsWith('MARKER_TOKEN'));
  truthy('blame hash valid',       /^[0-9a-f]{40}$/.test(b.hash));
}

{
  const f = fileLifespan('b.txt', { cwd: tmp });
  truthy('b.txt first_added',      !!f.first_added);
  truthy('b.txt deleted',          f.deleted.length === 1);
  truthy('b.txt not in tree',      f.still_exists === false);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);

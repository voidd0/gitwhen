#!/usr/bin/env node
'use strict';

const {
  searchString, searchRegex, blameLine, fileLifespan, parseLineSpec,
} = require('../src/index');

const HELP = `gitwhen — pinpoint when a string, line, or file changed in git history.

Usage:
  gitwhen "<query>"             when did this exact string appear/disappear?
  gitwhen <file>:<line>         what commit last set this line?
  gitwhen --regex "<pattern>"   regex variant of string search
  gitwhen --file <path>         when was this file added / deleted / re-added?
  gitwhen --path <path> "<q>"   restrict string search to one path

Options:
  --json                        JSON output instead of human timeline.
  --regex                       Treat query as regex (uses git log -G).
  --file <path>                 File-lifespan mode: first-added, deleted, last-touched.
  --path <path>                 Restrict string search to a path or pathspec.
  -h, --help                    Show this help.

Exit codes:
  0  results found (or empty result + clean exit)
  1  no results found
  2  invalid arguments / not a git repo

Examples:
  gitwhen "TODO: deprecated"
  gitwhen src/server/index.ts:42
  gitwhen --file backend/legacy.py
  gitwhen --regex "console\\.log\\(.*pii.*\\)"
  gitwhen "API_KEY" --path backend/
  gitwhen "feature_flag" --json | jq '.commits[0]'
`;

function parseArgs(argv) {
  const opts = { json: false, regex: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { opts.help = true; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--regex') { opts.regex = true; continue; }
    if (a === '--file') { opts.file = argv[++i]; continue; }
    if (a === '--path') { opts.path = argv[++i]; continue; }
    if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    positional.push(a);
  }
  return { positional, opts };
}

const isTTY = process.stdout.isTTY;
const C = {
  reset: isTTY ? '\x1b[0m' : '',
  dim:   isTTY ? '\x1b[2m' : '',
  bold:  isTTY ? '\x1b[1m' : '',
  red:   isTTY ? '\x1b[31m' : '',
  cya:   isTTY ? '\x1b[36m' : '',
  yel:   isTTY ? '\x1b[33m' : '',
  grn:   isTTY ? '\x1b[32m' : '',
};

function shortDate(iso) {
  if (!iso) return '?';
  return iso.slice(0, 10);
}

function printCommitLine(c, leadGlyph) {
  const lead = leadGlyph || '●';
  console.log(' ' + C.red + lead + C.reset + ' ' +
    C.cya + c.short + C.reset + ' ' +
    C.dim + shortDate(c.date) + C.reset + ' ' +
    C.bold + c.author + C.reset + ' ' +
    C.dim + '— ' + truncate(c.subject, 90) + C.reset);
}

function truncate(s, n) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function printSearchHuman(result) {
  const label = result.query !== undefined ? ('"' + result.query + '"') : ('regex /' + result.pattern + '/');
  console.log(C.bold + 'gitwhen' + C.reset + ' ' + label +
    (result.path ? C.dim + '  (path: ' + result.path + ')' + C.reset : ''));
  console.log('');
  if (result.commits.length === 0) {
    console.log(C.dim + '  no commits introduced or removed this query.' + C.reset);
    return;
  }
  for (const c of result.commits) printCommitLine(c);
  console.log('');
  console.log(C.dim + result.commits.length + ' commit(s) touched the diff.' + C.reset);
}

function printBlameHuman(b) {
  console.log(C.bold + 'gitwhen' + C.reset + ' ' + b.file + ':' + b.line);
  console.log('');
  console.log(' ' + C.cya + b.short + C.reset + ' ' +
    C.dim + shortDate(b.date) + C.reset + ' ' +
    C.bold + b.author + C.reset + ' ' +
    C.dim + '<' + (b.email || '') + '>' + C.reset);
  console.log('   ' + C.dim + b.subject + C.reset);
  if (b.content !== null && b.content !== undefined) {
    console.log('');
    console.log('   ' + C.yel + '│ ' + C.reset + b.content);
  }
}

function printFileHuman(f) {
  console.log(C.bold + 'gitwhen' + C.reset + ' --file ' + f.file +
    (f.still_exists ? '' : C.dim + '  (deleted in working tree)' + C.reset));
  console.log('');
  if (f.first_added) {
    console.log(' ' + C.grn + '+' + C.reset + ' first added');
    printCommitLine(f.first_added, ' ');
  } else {
    console.log(' ' + C.dim + 'no add commits found.' + C.reset);
  }
  if (f.deleted.length) {
    console.log('');
    console.log(' ' + C.red + '×' + C.reset + ' deleted');
    for (const c of f.deleted) printCommitLine(c, ' ');
  }
  if (f.re_added.length) {
    console.log('');
    console.log(' ' + C.yel + '↻' + C.reset + ' re-added');
    for (const c of f.re_added) printCommitLine(c, ' ');
  }
  if (f.last_touched) {
    console.log('');
    console.log(' ' + C.cya + '·' + C.reset + ' last touched');
    printCommitLine(f.last_touched, ' ');
  }
}

function main() {
  const argv = process.argv.slice(2);
  const { positional, opts } = parseArgs(argv);
  if (opts.help) { process.stdout.write(HELP); process.exit(0); }

  try {
    if (opts.file) {
      const f = fileLifespan(opts.file);
      if (opts.json) process.stdout.write(JSON.stringify(f, null, 2) + '\n');
      else printFileHuman(f);
      const found = !!f.first_added;
      process.exit(found ? 0 : 1);
    }

    if (positional.length === 1) {
      const spec = parseLineSpec(positional[0]);
      if (spec) {
        const b = blameLine(spec.file, spec.line);
        if (opts.json) process.stdout.write(JSON.stringify(b, null, 2) + '\n');
        else printBlameHuman(b);
        process.exit(0);
      }
    }

    if (positional.length === 0) {
      console.error('missing query. try: gitwhen --help');
      process.exit(2);
    }

    const query = positional.join(' ');
    const result = opts.regex
      ? searchRegex(query, { path: opts.path })
      : searchString(query, { path: opts.path });
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printSearchHuman(result);
    process.exit(result.count > 0 ? 0 : 1);
  } catch (e) {
    console.error(C.red + 'error:' + C.reset + ' ' + (e.message || String(e)));
    process.exit(2);
  }
}

main();

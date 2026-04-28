// gitwhen — pinpoint when a string, line, or file changed in git history.
// Wraps `git log -S`, `git blame`, and `git log --diff-filter=A` with
// sensible defaults so you don't have to memorize flag combinations.
// Zero runtime dependencies — calls system `git` via execFileSync.

'use strict';

const cp = require('node:child_process');
const path = require('path');
const fs = require('fs');

function runGit(args, cwd) {
  try {
    const out = cp.execFileSync('git', args, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 32,
    });
    return { ok: true, stdout: out, stderr: '' };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : (e.message || String(e)),
      code: e.status || null,
    };
  }
}

function ensureGitRepo(cwd) {
  const r = runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (!r.ok || r.stdout.trim() !== 'true') {
    throw new Error('not inside a git working tree (cwd: ' + (cwd || process.cwd()) + ')');
  }
}

const COMMIT_FIELDS = '%H|%h|%an|%ae|%aI|%s';

function parseCommitLine(line) {
  if (!line) return null;
  const parts = line.split('|');
  if (parts.length < 6) return null;
  const [hash, short, author, email, isoDate, ...rest] = parts;
  return {
    hash, short, author, email,
    date: isoDate,
    subject: rest.join('|'),
  };
}

function searchString(query, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  ensureGitRepo(cwd);
  const args = ['log', '--all', '-S', query, '--pretty=format:' + COMMIT_FIELDS];
  if (opts.path) args.push('--', opts.path);
  const r = runGit(args, cwd);
  if (!r.ok) throw new Error('git log -S failed: ' + r.stderr.trim());
  const commits = r.stdout.split('\n').map(parseCommitLine).filter(Boolean);
  return { query, path: opts.path || null, commits, count: commits.length };
}

function searchRegex(pattern, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  ensureGitRepo(cwd);
  const args = ['log', '--all', '-G', pattern, '--pretty=format:' + COMMIT_FIELDS];
  if (opts.path) args.push('--', opts.path);
  const r = runGit(args, cwd);
  if (!r.ok) throw new Error('git log -G failed: ' + r.stderr.trim());
  const commits = r.stdout.split('\n').map(parseCommitLine).filter(Boolean);
  return { pattern, path: opts.path || null, commits, count: commits.length };
}

function blameLine(filepath, line, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  ensureGitRepo(cwd);
  const abs = path.isAbsolute(filepath) ? filepath : path.join(cwd, filepath);
  if (!fs.existsSync(abs)) throw new Error('file does not exist: ' + filepath);
  const range = line + ',' + line;
  const args = ['blame', '-L', range, '--porcelain', '--', filepath];
  const r = runGit(args, cwd);
  if (!r.ok) throw new Error('git blame failed: ' + r.stderr.trim());
  const out = r.stdout;
  const headerMatch = /^([0-9a-f]{40})\s+(\d+)\s+(\d+)/m.exec(out);
  if (!headerMatch) throw new Error('could not parse blame output');
  const hash = headerMatch[1];
  const fields = {};
  out.split('\n').forEach((l) => {
    const m = /^(author|author-mail|author-time|author-tz|summary)\s+(.+)$/.exec(l);
    if (m) fields[m[1]] = m[2];
  });
  const contentLine = out.split('\n').find(l => l.startsWith('\t'));
  return {
    file: filepath,
    line: line,
    hash,
    short: hash.slice(0, 7),
    author: fields.author || null,
    email: (fields['author-mail'] || '').replace(/^<|>$/g, '') || null,
    date: fields['author-time']
      ? new Date(parseInt(fields['author-time'], 10) * 1000).toISOString()
      : null,
    subject: fields.summary || null,
    content: contentLine ? contentLine.slice(1) : null,
  };
}

function fileLifespan(filepath, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  ensureGitRepo(cwd);
  const argsAdded = ['log', '--all', '--diff-filter=A', '--reverse',
                     '--pretty=format:' + COMMIT_FIELDS, '--', filepath];
  const argsDeleted = ['log', '--all', '--diff-filter=D',
                       '--pretty=format:' + COMMIT_FIELDS, '--', filepath];
  const argsLast = ['log', '--all', '-1',
                    '--pretty=format:' + COMMIT_FIELDS, '--', filepath];
  const aR = runGit(argsAdded, cwd);
  const dR = runGit(argsDeleted, cwd);
  const lR = runGit(argsLast, cwd);
  if (!aR.ok) throw new Error('git log (added) failed: ' + aR.stderr.trim());
  const added = aR.stdout.split('\n').map(parseCommitLine).filter(Boolean);
  const deleted = dR.ok ? dR.stdout.split('\n').map(parseCommitLine).filter(Boolean) : [];
  const last = lR.ok ? (lR.stdout.split('\n').map(parseCommitLine).filter(Boolean)[0] || null) : null;
  const stillExists = fs.existsSync(path.isAbsolute(filepath) ? filepath : path.join(cwd, filepath));
  return {
    file: filepath,
    first_added: added[0] || null,
    re_added: added.slice(1),
    deleted: deleted,
    last_touched: last,
    still_exists: stillExists,
  };
}

function parseLineSpec(spec) {
  const m = /^(.+):(\d+)$/.exec(spec);
  if (!m) return null;
  return { file: m[1], line: parseInt(m[2], 10) };
}

module.exports = {
  searchString, searchRegex, blameLine, fileLifespan,
  parseLineSpec, ensureGitRepo,
};

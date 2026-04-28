# gitwhen

Pinpoint *when* a string, line, or file changed in git history. Wraps `git log -S`, `git blame`, and `git log --diff-filter=A` with sensible defaults so you don't have to memorize flag combinations. Zero deps. Free forever from vøiddo.

```
$ gitwhen "TODO: deprecated"
gitwhen "TODO: deprecated"

 ● a3c4b18 2026-03-14 alice — drop legacy queue path
 ● 7f1e602 2025-11-08 bob   — TODO before refactor

2 commit(s) touched the diff.
```

## Install

```bash
npm install -g @v0idd0/gitwhen
```

## Usage

```bash
# When did this string get added/removed?
gitwhen "TODO: deprecated"

# What commit last set this exact line?
gitwhen src/server/index.ts:42

# When was a file first added / deleted / re-added?
gitwhen --file backend/legacy.py

# Regex variant
gitwhen --regex "console\.log\(.*pii.*\)"

# Restrict string search to a path
gitwhen "API_KEY" --path backend/

# JSON for scripts
gitwhen "feature_flag" --json | jq '.commits[0].author'
```

## What it does

| Mode | Wraps | Output |
|---|---|---|
| `gitwhen "<query>"` | `git log --all -S "<query>"` | Every commit that introduced or removed this exact string, oldest first. |
| `gitwhen <file>:<line>` | `git blame --porcelain` | Hash, author, date, subject, and the line content for that single line. |
| `gitwhen --file <path>` | `git log --diff-filter=A/D` | First-added commit, every delete, re-adds, last-touched. Tells you a file's full life story. |
| `gitwhen --regex "<re>"` | `git log --all -G <re>` | Same as string mode but with regex matching on the diff. |

Add `--json` to any of them to get structured output for `jq`.

## Why

Git already knows when this happened. The problem is that `git log -S "literal" -- path/` and `git blame -L 42,42 file` and `git log --diff-filter=A --reverse -- path` are three commands you only run once a quarter, so you forget. `gitwhen` is an `npx`-able mnemonic for the trio.

## Exit codes

- `0` — found at least one match
- `1` — no commits matched (empty timeline)
- `2` — invalid arguments or not a git repo

Wire it into a pre-commit / CI guardrail, e.g.:

```bash
# Block commits that re-introduce a string we deliberately removed
gitwhen --json "OLD_DEPRECATED_API" | jq -e '.count > 0' > /dev/null && {
  echo "OLD_DEPRECATED_API is back in your tree."
  exit 1
}
```

## Programmatic API

```javascript
const { searchString, blameLine, fileLifespan } = require('@v0idd0/gitwhen');

const r = searchString('feature_flag', { cwd: '/path/to/repo' });
console.log(r.commits[0]);
// { hash, short, author, email, date, subject }
```

## License

MIT — part of the [vøiddo](https://voiddo.com) tools collection.

Built by vøiddo, a small studio shipping AI-flavoured tools, browser extensions and weird browser games.

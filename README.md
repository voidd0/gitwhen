# gitwhen

[![npm version](https://img.shields.io/npm/v/@v0idd0/gitwhen.svg?color=A0573A)](https://www.npmjs.com/package/@v0idd0/gitwhen)
[![npm downloads](https://img.shields.io/npm/dw/@v0idd0/gitwhen.svg?color=1F1A14)](https://www.npmjs.com/package/@v0idd0/gitwhen)
[![License: MIT](https://img.shields.io/badge/license-MIT-A0573A.svg)](LICENSE)
[![Node ≥14](https://img.shields.io/badge/node-%E2%89%A514-1F1A14)](package.json)

Pinpoint *when* a string, line, or file changed in git history. Wraps `git log -S`, `git blame`, and `git log --diff-filter=A` with sensible defaults so you don't have to memorize flag combinations. Zero deps. Free forever from vøiddo.

```
$ gitwhen "TODO: deprecated"
gitwhen "TODO: deprecated"

 ● a3c4b18 2026-03-14 alice — drop legacy queue path
 ● 7f1e602 2025-11-08 bob   — TODO before refactor

2 commit(s) touched the diff.
```

## Why gitwhen

Git already knows the answer. The problem is the question takes three different commands depending on whether you want to find when a *string* entered the codebase, when a *line* was last set, or when a *file* was first added or last deleted. You only run any of them once a quarter, so by the time you need it you've forgotten the flag soup. `git log -S "<str>" -- path/`, `git blame -L 42,42 file`, `git log --diff-filter=A --reverse -- path` — three different mental models. gitwhen is the mnemonic that wraps all three.

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
| `gitwhen "<query>"` | `git log --all -S "<query>"` | Every commit that introduced or removed this exact string, oldest first |
| `gitwhen <file>:<line>` | `git blame --porcelain` | Hash, author, date, subject, line content |
| `gitwhen --file <path>` | `git log --diff-filter=A/D` | First-added commit, every delete, re-adds, last-touched |
| `gitwhen --regex "<re>"` | `git log --all -G <re>` | Same as string mode but regex matching on the diff |

Add `--json` to any for structured output ready for `jq`.

## Compared to alternatives

| tool | string-pickaxe | line-blame | file-lifespan | regex on diff | install |
|---|---|---|---|---|---|
| gitwhen | yes | yes | yes | yes | one npm install |
| `git log -S` | yes | no | no | no | bundled |
| `git blame` | no | yes | no | no | bundled |
| `git log --diff-filter` | no | no | yes | no | bundled |
| GitLens (VS Code) | yes | yes | yes | partial | editor extension |

If you live in VS Code, GitLens does this and more. For a terminal-resident workflow (server triage, code review on a remote box), gitwhen is the consolidating CLI.

## FAQ

**Why search across all branches by default?** Because regressions tend to live in *some* branch you forgot about. `git log -S` defaulting to current branch means "I know what reverted me" misses the obvious answer.

**Performance on a 100K-commit repo?** First search is bound by `git log -S` itself (a few seconds in pathological cases). gitwhen adds <100ms of parsing on top.

**Does it find renames?** For `--file` mode yes (we pass `--follow`). For string-pickaxe mode renames don't matter — the content is what's tracked.

**What about `git log --all -L <line>`?** That's the "evolution of this exact line" view. It's powerful but slow on large files; gitwhen's blame mode is the snapshot ("who set this *now*"). Different question, different tool.

## Exit codes

- `0` — found at least one match
- `1` — no commits matched (empty timeline)
- `2` — invalid arguments or not a git repo

Wire it into a pre-commit / CI guardrail:

```bash
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

## More from the studio

This is one tool out of many — see [`from-the-studio.md`](from-the-studio.md) for the full lineup of vøiddo products (other CLI tools, browser extensions, the studio's flagship products and games).

## License

MIT.

---

Built by [vøiddo](https://voiddo.com/) — a small studio shipping AI-flavoured products, free dev tools, Chrome extensions and weird browser games.

# Project-rule checks

Automatic enforcement for the mechanical rules in CLAUDE.md ("Project rules").
One library, three entry points, so every path enforces the same rule:

| Entry point | Runs | Checks |
|---|---|---|
| `check-commit-msg.sh` | git `commit-msg` hook (`.pre-commit-config.yaml`) | gitmoji prefix, subject ≤ 50 chars after the emoji, no AI attribution |
| `check-pr.sh` | CI (`.github/workflows/pr-rules.yml`) on every PR | gitmoji title, `## What` / `## How to test` / `## No regression`, < 200 words of prose, no AI attribution, frontend + backend not mixed, curl when `backend/api/specs/` changes |
| `guard-claude-bash.sh` | Claude Code `PreToolUse` hook on Bash (`.claude/settings.json`) | no `scripts/seed.env`, no `sed -i` / `perl -i` on source, no attribution in commits, `gh pr create/edit` must use `--body-file` and pass `check-pr.sh` |

CI also rejects added Go lines that use the name `uid`. `.claude/settings.json`
denies the Read and Edit tools on `scripts/seed.env`.

## Setup

```bash
pre-commit install   # installs the pre-commit and commit-msg hooks
```

## Exceptions

* A PR the owner asked to combine across frontend and backend: add a line
  `FE/BE-EXCEPTION: <reason>` to its description.
* Merge, revert, fixup and squash commits written by git are not checked.

## Tests

```bash
bash scripts/rules/test.sh
```

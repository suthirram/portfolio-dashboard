---
name: plan-doc-required
description: >
  Enforces that every non-trivial change ships with a detailed execution plan
  documented under docs/plans/, prefixed with its PR number. Invoke whenever
  the user approves a plan, asks to start implementing a feature/refactor/fix
  larger than a one-file tweak, opens a PR, or asks to "write the plan",
  "document the plan", "save the plan", "create a PD", "document this PR's
  plan". Also trigger before pushing a branch that lacks a matching plan file
  — block the push until one is written and committed.
---

# Plan-doc-required Skill

Every non-trivial change in this repo ships with a written, user-approved
execution plan saved under `docs/plans/`, file-named with the PR number.
This is non-negotiable: no plan doc → no PR.

## Why

The repo already has [PD-012](../docs/plans/PD-012-cloudflare-flyio-deploy.md)
and [PD-022](../docs/plans/PD-022-user-auth-and-multi-tenancy.md). Both let a
reviewer (and future maintainers) understand *why* the change exists, what
was rejected, and what follow-ups were left behind — context that gets lost
the moment the PR description scrolls off GitHub. The plan document is
load-bearing project memory; treat it as a first-class deliverable, not a
nice-to-have.

## When to write the plan

* Any change that introduces a new feature, a new package, a new endpoint, a
  schema migration, a cross-file refactor, or a deployment-affecting change.
* Any change traced to a PRD (`docs/prds/`) or DD (`docs/designs/`).
* Any change a future maintainer would want a paper-trail for.

Skip the plan doc only for:

* Pure typo fixes / formatting / dependency bumps with no behaviour change.
* Single-file edits that finish a previously-planned line of work and whose
  reasoning is fully captured in the commit message.

When in doubt, write the plan.

## File-name convention (strict)

```
docs/plans/PD-<pr-number>-<kebab-slug>.md
```

* `PD-` literal prefix (Plan Doc).
* `<pr-number>` is the **GitHub PR number** that will carry the change,
  zero-padded to **3 digits** to match the existing files. Example:
  PR #22 → `PD-022-…`.
* `<kebab-slug>` is a short, descriptive lowercase-kebab summary of the
  scope. Examples that already exist:
  * `PD-012-cloudflare-flyio-deploy.md`
  * `PD-022-user-auth-and-multi-tenancy.md`

If the PR number is not yet known (plan written *before* the branch is
pushed), use the next-available number — `gh pr list --state all --limit 1
--json number -q '.[0].number'` plus one is the cheap way to look it up.
Rename the file (and any in-text references) to match the real number once
`gh pr create` returns.

## Required structure

Mirror the existing PDs. At minimum:

1. **Header** — `# PD-NNN: <title>` followed by a one-sentence summary linking
   the PRD/DD that motivates it.
2. **Goals / Non-goals** — what is in scope, what is explicitly not.
3. **Build order** — numbered, test-first steps. One step per logical
   slice; each step names the files it touches and the tests it adds.
4. **Verification run** — concrete commands the author ran
   (`go test ./...`, `npm run typecheck`, `pre-commit run --all-files`, etc.)
   and the result.
5. **Deviations from the design doc** — every place the implementation
   diverges from the PRD/DD, and why. If there are none, say so.
6. **Known follow-ups** — work deliberately left for a later PR, with enough
   context that the next author can pick it up.
7. **Rollout / Rollback** — for deploy-affecting changes only.

A **Post-review refinements** section is added after merge-prep when the PR
gains substantive changes during review (see PD-022 for the canonical
example) — date it, list each refinement, and re-state the verification run.

## Workflow (non-negotiable)

1. **Before coding**, write the plan and get explicit user approval. "Looks
   good", "go ahead", "ship it" all count; silence does not.
2. **Save the approved plan** to `docs/plans/PD-NNN-<slug>.md` and commit
   it as the **first commit** on the feature branch. Subsequent commits
   reference it.
3. **Keep the plan honest** as the work evolves. If you change approach,
   amend the plan (or add a Post-review-refinements section) in the same
   commit that changes the code — never let the plan drift behind reality.
4. **Block the PR if the plan is missing.** When asked to open a PR
   (`gh pr create`), first run:

   ```bash
   git diff --name-only main...HEAD -- docs/plans/ | grep -E 'PD-[0-9]{3}-'
   ```

   If the result is empty, refuse to open the PR. Write the plan, commit
   it, then proceed.
5. **At review time**, link the plan from the PR description. The PR body
   should be a short summary; the deep reasoning lives in the PD.

## Hard rules

* No PR without a matching `docs/plans/PD-NNN-*.md`.
* No plan committed without explicit user approval of the content.
* Plan filename always uses the **same** PR number as the PR carrying the
  change; no renumbering after merge.
* Do not write planning docs anywhere else (`.claude/plans/`, `notes/`,
  scratch files) — `docs/plans/` is the only canonical location.
* Do not delete a plan after merge; PDs are an append-only history.

## Quick template

When the user approves a plan, drop this skeleton into
`docs/plans/PD-NNN-<slug>.md` and fill it in:

```markdown
# PD-NNN: <Title>

Implements [PRD-???](../prds/PRD-???-<slug>.md) /
[DD-???](../designs/DD-???-<slug>.md).

## Goals

- …

## Non-goals

- …

## Build order (each step = test-first)

1. **<step>** — files touched, tests added.
2. …

## Verification run

- `go test ./...` — all packages `ok`
- `golangci-lint run ./...` — 0 issues
- `pre-commit run --all-files` — passed
- frontend: `npm run typecheck` / `npm run build` — clean

## Deviations from the design doc

1. …

## Known follow-ups

- …

## Rollout

1. …

Rollback: …
```

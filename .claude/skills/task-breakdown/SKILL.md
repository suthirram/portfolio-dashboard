---
name: task-breakdown
description: How to split a scheduled or planned task into small, shippable sub-tasks. Use whenever a task is scheduled, a multi-step feature is requested, or you are about to open a PR for anything larger than a one-liner. Governs sub-task sizing, the "no regression + adds value + testable" bar, and the required PR-description shape (test steps, ≤200 words).
---

# Breaking down a scheduled task

When a task is scheduled or a feature spans more than a trivial edit, do
**not** implement it as one lump. Split it first, then ship the slices.

## Split rule

Break the task into the smallest sub-tasks that each independently satisfy
ALL three gates. If a slice fails any gate, split it further or merge it
with a neighbour — never ship it.

1. **No regression** — the sub-task must not break current behaviour.
   Existing flows keep working exactly as before; the change is additive or
   behind a path users don't yet reach.
2. **Adds value** — it must deliver something a user or the system can use:
   a visible UI affordance, or a concrete business-logic capability. No
   pure-scaffolding PRs that a user gains nothing from on their own.
3. **Testable** — ALWAYS. Every sub-task ships with a test that would fail
   without the change. Pure logic → unit test; UI → render/interaction test;
   endpoint → handler test. "No new feature without tests" is absolute here.

A good slice is one PR, one branch, reviewable in a sitting, and revertable
without disturbing the others. Order slices so each builds on merged work,
never on an unmerged branch.

## Sequencing

* List the slices before coding. Confirm each passes the three gates.
* Ship in dependency order; each merges to `main` via its own PR (repo
  workflow — never commit to `main`).
* A slice that only makes sense paired with the next one is too small —
  merge them so the pair clears "adds value".

## PR description — required shape

Every PR description MUST:

* Stay **under 200 words** (hard cap — trim prose, not substance).
* Include a **"How to test"** section: concrete, ordered steps a reviewer
  runs to verify the slice (commands, routes, expected result), plus the
  automated test to run (e.g. `npx vitest run <file>` / `go test ./...`).
* State what value the slice adds and confirm no existing behaviour changes.

Skeleton:

```markdown
## What
<1-2 sentences: the value this slice adds.>

## How to test
1. <step — command or UI action>
2. <step — expected observable result>
- Automated: `<test command>` (N tests pass)

## No regression
<why existing flows are untouched.>
```

Keep it tight. If the description creeps past 200 words, the slice is
probably too big — split it.

---
name: tdd-no-fix-without-test
description: Enforce test-first changes for agents working in this repository.
---

# Test-First Agent Practice

Use this skill for every bug fix, behavior change, refactor with user-visible impact, and feature implementation in this repository.

## Planning Rule

Every task needs a plan file in `docs/plans`.

1. Before changing production code, create or update the relevant plan document under `docs/plans`.
2. Use the existing plan naming convention when one applies, such as `PD-022-user-auth-and-multi-tenancy.md`.
3. Check project-local skill files, including `.agents/SKILL.md` and `.claude/*.md`, before deciding which skills apply.
4. Keep the plan current as the work changes, including assumptions, deviations, tests, and known follow-ups.
5. Include the agent skills used by the task in the plan document, and note when a skill was consulted only as context.
6. Do not leave implementation work undocumented in chat only.

## Core Rule

No fix without a test. Practice TDD:

1. Understand the expected behavior and the current failure.
2. Write or update the smallest meaningful test that captures the behavior.
3. Run the targeted test and confirm it fails for the right reason.
4. Implement the minimal production change.
5. Re-run the targeted test, then the relevant broader suite.

Do not change production code first unless the task is documentation-only, formatting-only, or a mechanical non-behavioral update.

## Test Quality

* Test business behavior and critical paths, not private implementation details.
* Prefer unit tests. Add integration tests only when they validate meaningful interactions between components.
* Avoid duplicate coverage across layers unless the higher-level test proves additional behavior.
* Cover success paths, edge cases, input validation, and application-level error handling.
* Do not add tests solely to raise coverage.
* Do not simulate impossible or out-of-scope infrastructure failures, including database availability failures when the project assumes the database is available.
* Keep tests deterministic, fast, and easy to maintain.

## Workflow Expectations

* For regression bugs, reproduce the bug with a failing test before fixing it.
* For backend changes, run the smallest relevant `go test` package first, then expand to `go test ./...` before completion.
* For frontend changes, add or update the relevant component, hook, or utility tests when available, and run the project's standard typecheck/build/test commands.
* Reuse existing fixtures, helpers, mocks, and factories before creating new ones.
* If a behavior cannot be tested with the current harness, stop and document the limitation before making the change.
* Every final handoff should mention the targeted tests and full-suite verification that were run.

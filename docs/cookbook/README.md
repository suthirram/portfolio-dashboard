# Troubleshooting cookbook

Use this cookbook to reproduce, diagnose, and resolve repository problems.
Search existing entries first. Every agent troubleshooting task must add an
entry or update the relevant one before handoff, including unresolved work.

## Entries

* [Docker tracing startup: missing network and Tempo volume permissions](docker-tracing-startup.md)
* [Local preview server and missing Playwright browser](local-preview-access.md)

## Writing an entry

Use a descriptive filename and add a link above. Keep commands runnable from
the repository root unless another directory is stated. Capture the smallest
useful error excerpt, the evidence that supports the diagnosis, and the exact
verification result. Separate observed facts from hypotheses. Update an
existing entry when symptoms and cause match; record distinct causes separately
within the entry or in a new linked entry.

Remove credentials, tokens, cookies, connection-string secrets, and personal
portfolio data. Use placeholders where necessary. State the scope and data
impact of repair commands. Existing approval rules still apply, especially
for destructive actions and production changes.

Copy this template into a new Markdown file:

````markdown
# <Problem title>

* Status: Resolved / Investigating
* Last verified: YYYY-MM-DD (or not yet verified)
* Environment: relevant versions, services, and local/dev/prod scope
* Related: relative links to runbooks, specs, or other cookbook entries

## Problem and trigger

What failed, its impact, and the action or condition that triggered it.

## Reproduction and diagnostic aids

Steps to reproduce, or commands/logs/traces that help diagnose the problem
when deterministic reproduction is unavailable. Include expected versus
observed output and a minimal redacted error excerpt.

```bash
<diagnostic command>
```

## Cause and evidence

Explain the cause and the evidence connecting it to the symptom. Label any
unconfirmed hypothesis explicitly.

## Solution

State prerequisites, scope, and data impact, then give the repair steps.
For unresolved work, record attempted actions and their outcomes instead.

```bash
<repair command>
```

## Verification

Give commands and expected results, plus the actual observed outcome and
any remaining limitations. Do not claim success based only on startup output.

## Follow-up

For unresolved work: blocker and next diagnostic step. Otherwise record any
remaining prevention work, or state that none is required.
````

# AI Instruction Hub — portfolio-dashboard

Central index for all AI agent instructions. Every rule has exactly one canonical location.

---

## Self-check

Load these files when relevant to the task:

| File | When to load |
|---|---|
| `CLAUDE.md` | Always — hard rules, stack, key locations |
| `docs/agent/PROJECT_INTENT.md` | Before building any feature — scope, roles, what not to over-build |
| `docs/agent/ARCHITECTURE.md` | Any backend or frontend file changes — file map, data flow |
| `docs/agent/CONVENTIONS.md` | Any `.go` file — naming, logging, error handling, auth, ledger |
| `docs/ai/instructions/mongodb.md` | Any `internal/persistence/` work |
| `docs/ai/instructions/testing.md` | Any `*_test.go` work |
| `docs/ai/instructions/openapi-specs.md` | Any `backend/api/specs/*.yaml` work |

---

## Canonical locations

| Rule category | Lives in |
|---|---|
| Hard rules, stack, git, security | `CLAUDE.md` |
| Feature scope, roles, what to build | `docs/agent/PROJECT_INTENT.md` |
| File map, data flow, package responsibilities | `docs/agent/ARCHITECTURE.md` |
| Go style, naming, logging, auth, ledger, snapshots | `docs/agent/CONVENTIONS.md` |
| Persistence layer patterns | `docs/ai/instructions/mongodb.md` |
| Test strategy | `docs/ai/instructions/testing.md` |
| OpenAPI + codegen workflow | `docs/ai/instructions/openapi-specs.md` |

---

## Adding new rules

1. Pick the canonical file above for the rule's scope.
2. Add a pointer here if it's a new topic file.
3. Never duplicate — update the canonical location only.
4. If a repeated task emerges, create a skill (`~/.claude/commands/`) instead of adding more rules here.

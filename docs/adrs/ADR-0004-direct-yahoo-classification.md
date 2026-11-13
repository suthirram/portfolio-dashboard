# ADR-0004: Fetch holding classification directly from Yahoo

* **Status**: Draft
* **Date**: 2026-11-13
* **Deciders**: project owner
* **Related**: [PRD-013](../prds/PRD-013-holding-sectors.md),
  [DD-013](../designs/DD-013-holding-sectors.md),
  [PD-056](../plans/PD-056-holding-sectors.md)

## 1. Context

The app currently fetches prices directly from Yahoo's chart endpoint using
Go HTTP/JSON. Sector data requires a separate company profile lookup and a
session cookie/crumb exchange. The owner explicitly wants no intermediary API
and no downloaded finance library that could access local data or credentials.
An absent sector may mean missing company coverage or a provider error, not a
fund. Existing holdings also need repeatable backfill without financial changes.

## 2. Decision

Implement the Yahoo profile protocol in Go with standard-library HTTP/JSON and
existing application logging/tracing. Keep the session server-side and in
memory, allow only fixed Yahoo HTTPS hosts, and never execute returned scripts.
Only ticker symbols go to the provider. Add no finance dependency or data broker.

Persist classification as symbol-bound metadata on each holding. Confirmations
are scoped to the owner, take precedence over the provider, and survive backfill.
Treat missing, failed, conflicting, and unknown classifications as reviewable.
Require an explicit owner confirmation before changing an asset type to a fund.
Distinguish a fund's type from company sector; fund look-through is deferred.

## 3. Consequences and alternatives

The integration inherits the instability of Yahoo's unofficial endpoints. The
app must save pending holdings when Yahoo is unavailable and allow manual review.
Standard-library code still needs validation, timeouts, bounded responses, and
tests; avoiding a new dependency does not remove those requirements.

A finance wrapper would reduce protocol work but expands the dependency trust
boundary against the owner's request. A third-party metadata API violates the
direct-provider requirement. Inferring ETF/MF from missing sector is inaccurate.
Manual-only classification is retained as a fallback, not the default experience.

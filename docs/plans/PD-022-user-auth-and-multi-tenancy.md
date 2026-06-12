# PD-022: User auth and regional multi-tenancy implementation plan

Status: in progress - implemented locally, pending review/merge (2026-06-12)
Owner: project owner
Related:

* [PRD-001](../prds/PRD-001-user-auth-and-multi-tenancy.md)
* [DD-001](../designs/DD-001-user-auth-and-multi-tenancy.md)

This plan tracks the implementation work for PRD-001 using the approved
technical design in DD-001.

## Agent skills used

* `portfolio-dashboard`: consulted as project context for the existing
  full-stack holdings dashboard. It is scaffold-focused, so it did not override
  the PRD/DD-specific PD-022 implementation requirements.
* `tdd-no-fix-without-test`: require meaningful tests for behavior changes and
  regression fixes before completing implementation.
* `plan-file-maintenance`: keep the task plan in `docs/plans` current as work
  progresses.

## Assumptions and deviations

* No separate PD-022 spec file was found, so PD-022 is treated as the delivery
  plan for PRD-001 and DD-001.
* The existing holdings dashboard must stay in place. New auth and account
  flows are added alongside it rather than replacing or deleting the holdings
  screen.
* Security-question answers are intentionally not viewable in profile because
  answers are hashed. The profile UI should show selected questions and allow
  users to replace answers.
* Database availability and database infrastructure failure scenarios remain
  out of test scope because the project assumes the database is available.

## Implementation plan

1. Read PRD-001 and DD-001 end to end.
2. Add backend auth domain models for users, sessions, roles, regions, and
   security questions.
3. Add password and security-answer hashing, normalization, validation, and
   bootstrap super-admin support.
4. Add session-cookie authentication and CSRF protection with
   `X-Requested-With`.
5. Scope holdings, prices, and summaries by authenticated user.
6. Add admin and super-admin workflows for regional user management,
   promotion, demotion, lockout reset, hide/reactivate, delete, and
   act-as-user portfolio support.
7. Add migration and break-glass owner commands for existing holdings and
   super-admin recovery.
8. Extend the OpenAPI contract and regenerate backend/frontend API bindings.
9. Add frontend auth flows for signup, login, logout, recovery, forced setup,
   profile management, and admin management while preserving the existing
   holdings dashboard.
10. Add tests for business behavior, authorization boundaries, input
    validation, recovery lockout behavior, and user-scoped holdings.
11. Run targeted tests while implementing, then run the full backend suite and
    frontend typecheck/build before handoff.

## Completed locally

* Added backend auth, session, catalog, and credential helpers.
* Added auth, profile, recovery, admin, and act-as portfolio API handlers.
* Updated holdings and summary paths to require a user context and apply
  `user_id` scoping.
* Added MongoDB indexes for users, sessions, and user-scoped holdings.
* Added bootstrap super-admin, owner reset, and migration commands.
* Added frontend auth/profile/admin flows through a new auth feature area.
* Preserved the holdings dashboard and wrapped it in auth-aware routing.
* Fixed reported UI issues:
  * security-question lists now use the full catalogue;
  * duplicate security-question selections are blocked;
  * profile explains that answers cannot be viewed and can only be replaced;
  * profile provides a back path to the dashboard.
* Fixed dashboard routing so the default dashboard always shows the logged-in
  user's own holdings, direct navigation to the current user's admin/act-as
  dashboard routes back to the home dashboard, and the redundant portfolio
  banner is removed from the holdings view.
* Fixed follow-up user-management UI issues:
  * replaced separate `Admin` / `Admins` navigation with a single `Users`
    entry;
  * added compact SVG icons to account navigation buttons;
  * show the act-as portfolio banner for admin and super-admin views of other
    users, while keeping it hidden for the logged-in user's own dashboard.
* Fixed follow-up profile update issues:
  * profile, password, and security-question updates must be independent
    actions in one form;
  * blank security-question rows must not force a security-question update;
  * typed security-question answers should be visible while editing.

## Tests and verification

Targeted and full-suite validation performed locally:

* `go test ./...`
* `npm test`
* `npm run typecheck`
* `npm run build`

The frontend build completed with the existing Vite chunk-size warning.

## Intentionally uncovered

* Database outage, connection, and infrastructure failure simulations.
* Email reset, OAuth, magic links, two-factor auth, audit logging, real data
  residency, and rate limiting because they are out of scope for PRD-001.
* Reading security-answer values back from storage or displaying them in the
  profile because answers are stored as hashes by design.

## Open before PR readiness

* Confirm whether the repository will add a browser E2E harness for the minimal
  signup/login/dashboard/admin smoke journey, or capture that as a follow-up if
  the current scope remains backend and frontend build validation only.
* Re-run the full validation suite after any additional frontend bug fixes.

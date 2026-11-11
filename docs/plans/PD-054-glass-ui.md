# PD-054: Rollout plan — glass UI behind a per-account switch

* **Status**: Draft v1, owner decisions of 2026-11-11 applied
* **Owner**: project owner
* **Goal**: A modern "glass and depth" UI on every signed-in page (app
  shell with sidebar, ⌘K command palette, toasts, skeletons, dashboard hero),
  switched on per account by the super admin in Admin → Users; everyone else
  keeps the current UI unchanged.
* **Architecture**: one user flag (`ui_revamp`) on the shared super-admin
  switch path, mirrored to `<html data-ui="v2">`; a stylesheet whose every
  rule is scoped under that attribute (tokens restyle the inline styles,
  surface rules add the blur); a layout route that wraps the signed-in pages
  in the shell only for glass accounts.
* **Tech stack**: Go (echo strict server, oapi-codegen, mtest), React 18 +
  TypeScript, plain CSS, vitest + Testing Library. No new dependencies.
* **Spec**: [PRD-011](../prds/PRD-011-glass-ui.md) ·
  [DD-011](../designs/DD-011-glass-ui.md) ·
  [visual spec](../visuals/PD-054-glass-ui.html)

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | `setUserFlag`, `UserFlagToggleRequest`, `formatMoney`, `GroupDayChange`, `ThemePicker`, the `.skeleton` / `.brand-tile` / `.btn` classes, the existing tokens |
| One implementation PR, frontend and backend together | owner (2026-11-11) | PR2 carries `FE/BE-EXCEPTION: owner asked for one PR (PD-054)` |
| Docs before a big task | CLAUDE.md | PR1 (this plan, PRD-011, DD-011, the visual spec) lands first |
| Nothing may break prod | owner | every rule scoped under `data-ui="v2"`; the switch is off for every account until the super admin turns it on |
| Endpoint PRs carry curl | CLAUDE.md | PR2 |
| Behaviour tests only; mtest for Go | CLAUDE.md | DD-011 §8 |
| Descriptive names, ESLint on changed files | CLAUDE.md | `Icon.tsx` (`p`), `ThemePicker.tsx` (`o`, `v`, `t`), `useTheme.ts` (`v`, `t`) renamed |
| Gitmoji, subject ≤ 50 chars, no attribution | CLAUDE.md | every commit and PR below |
| Edit tool for source | CLAUDE.md | every Modify step is an Edit (current → replacement) |
| Go and other blocks: tabs shown as 4 spaces | markdownlint MD010 | type them with tabs, or run `gofmt -w`; Task 1 verifies with `gofmt -l` |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `docs/prds/PRD-011-glass-ui.md` | what and why |
| Create | `docs/designs/DD-011-glass-ui.md` | how |
| Create | `docs/plans/PD-054-glass-ui.md` | this plan |
| Create | `docs/visuals/PD-054-glass-ui.html` | interactive mockups |
| Modify | `docs/visuals/README.md` | index row |
| Modify | `backend/api/specs/*.yaml`, `backend/api/*.gen.go` | `ui_revamp` on the user, the switch route |
| Modify | `backend/internal/domain/user.go`, `backend/internal/services/mapper.go` | the flag on the account and `/auth/me` |
| Modify | `backend/internal/controllers/admin.go`, `admin_test.go`, `backend/internal/httpserver/auth.go` | the switch handler, its tier, its tests |
| Create | `frontend/src/lib/uiMode.ts` (+ test) | `<html data-ui>` follows the account |
| Create | `frontend/src/lib/toast.ts` (+ test), `frontend/src/components/shell/Toaster.tsx` | toasts and `notify` |
| Create | `frontend/src/components/shell/AppShell.tsx`, `CommandPalette.tsx` (+ tests) | the shell and the palette |
| Create | `frontend/src/styles/glass.css` | the glass look |
| Create | `frontend/src/components/PortfolioHero.tsx` (+ test) | the dashboard hero |
| Modify | `frontend/src/App.tsx`, `main.tsx`, `index.css` | wiring |
| Modify | `frontend/src/lib/useTheme.ts`, `components/ThemePicker.tsx`, `components/Icon.tsx` | theme sync, picker class, icons |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx`, `admin/AdminShell.tsx`, `admin/AdminUserList.tsx`, `history/HistoryPage.tsx`, `transactions/TransactionsPage.tsx` (+ tests) | page rework, the admin switch |
| Modify | `frontend/src/lib/api/client.ts`, `schema.gen.ts`, `features/auth/guardRules.test.ts` | the switch call, generated types, fixture |

## PR sequence (each slice passes the three gates)

| # | Branch → base | Tasks | Value (gate 2) | Test that fails without it (gate 3) | No regression (gate 1) |
|---|---|---|---|---|---|
| PR1 | `docs/PD-054-glass-ui` → `main` | 0 | agreed design on record | — (docs) | docs only |
| PR2 | `feat/PD-054-glass-ui` → `main` | 1–5 | the glass UI, switchable per account | `TestAdminSetUserUiRevamp`, the shell / palette / toast / ui-mode / hero / dashboard / admin tests | every rule under `data-ui="v2"`; off for everyone by default; the full suite passes |
| — | — | 6 | end to end on a throwaway database | scenarios 1–7 | — |

One implementation PR, by owner request (2026-11-11); its commits follow
Tasks 1–5, so it can be reviewed commit by commit.

## PR bodies

Every PR description uses this shape and stays under 200 words:

````markdown
## What
<value this slice adds, 1–2 sentences>

## How to test
1. <step>
2. <expected result>
- Automated: `<command>` (<N> tests pass)

## No regression
<why existing flows are untouched>
````

---

## Task 0: Land the docs (PR1)

**Files:**

* Create: `docs/prds/PRD-011-glass-ui.md`, `docs/designs/DD-011-glass-ui.md`, `docs/plans/PD-054-glass-ui.md`, `docs/visuals/PD-054-glass-ui.html`
* Modify: `docs/visuals/README.md`

* [ ] **Step 1: Lint the markdown**

```bash
npx markdownlint-cli@0.45.0 --config .markdownlintrc docs/prds/PRD-011-glass-ui.md docs/designs/DD-011-glass-ui.md docs/plans/PD-054-glass-ui.md docs/visuals/README.md
```

Expected: no output.

* [ ] **Step 2: Commit, push, open PR1**

```bash
git add docs/prds/PRD-011-glass-ui.md docs/designs/DD-011-glass-ui.md docs/plans/PD-054-glass-ui.md docs/visuals/PD-054-glass-ui.html docs/visuals/README.md
git commit -m "📝 Plan the glass UI"
git push -u origin docs/PD-054-glass-ui
gh pr create --title "📝 Add the PRD, design doc, plan and visual spec for the glass UI" --body-file pr1.md
```

Expected: PR URL; CI markdownlint green.

* [ ] **Step 3: Branch for the implementation**

```bash
git fetch origin && git checkout -b feat/PD-054-glass-ui origin/main
```

Expected: Tasks 1–5 commit here, one commit each.

---

## Task 1: The per-account switch (backend)

**Files:**

* Modify: `backend/api/models.gen.go`, `backend/api/server.gen.go`, `backend/api/specs/admin/admin.yaml`, `backend/api/specs/openapi.yaml`, `backend/api/specs/portfolio-api.yaml`, `backend/internal/controllers/admin.go`, `backend/internal/controllers/admin_test.go`, `backend/internal/domain/user.go`, `backend/internal/httpserver/auth.go`, `backend/internal/services/mapper.go`

* [ ] **Step 1: Edit `backend/api/specs/admin/admin.yaml`**

WHY: the switch route mirrors `delta-from-history`: same body, same responses, super admin only.

Current:

```yaml
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"

users_id_holdings:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
```

Replacement:

```yaml
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"

users_id_ui_revamp:
  put:
    tags: [Admin]
    summary: Switch an account to the glass UI (super admin only)
    description: |
      PD-054. On: the account sees the glass UI (app shell with sidebar,
      command palette, toasts, reworked pages). Off (default): the current
      UI. Super admin only; the super admin may switch their own account.
    operationId: adminSetUserUiRevamp
    parameters:
      - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/UserFlagToggleRequest"
    responses:
      "204":
        description: Switch updated
      "403":
        $ref: "../portfolio-api.yaml#/components/responses/Forbidden"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"

users_id_holdings:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
```

* [ ] **Step 2: Edit `backend/api/specs/openapi.yaml`**

WHY: registers the new path with the router.

Current:

```yaml
    $ref: "./admin/admin.yaml#/users_id_premium"
  /admin/users/{id}/delta-from-history:
    $ref: "./admin/admin.yaml#/users_id_delta_from_history"
  /admin/branding:
    $ref: "./admin/admin.yaml#/branding"
  /gold/transactions:
```

Replacement:

```yaml
    $ref: "./admin/admin.yaml#/users_id_premium"
  /admin/users/{id}/delta-from-history:
    $ref: "./admin/admin.yaml#/users_id_delta_from_history"
  /admin/users/{id}/ui-revamp:
    $ref: "./admin/admin.yaml#/users_id_ui_revamp"
  /admin/branding:
    $ref: "./admin/admin.yaml#/branding"
  /gold/transactions:
```

* [ ] **Step 3: Edit `backend/api/specs/portfolio-api.yaml`**

WHY: `ui_revamp` joins the required user fields like the other switches, so a missing value is a contract error, not a silent off.

Current:

```yaml

    User:
      type: object
      required: [id, username, name, role, region, disabled, locked, gold_enabled, premium, delta_from_history, must_change_password]
      properties:
        id:
          type: string
```

Replacement:

```yaml

    User:
      type: object
      required: [id, username, name, role, region, disabled, locked, gold_enabled, premium, delta_from_history, ui_revamp, must_change_password]
      properties:
        id:
          type: string
```

WHY: the same change, next spot in `portfolio-api.yaml`.

Current:

```yaml
        delta_from_history:
          type: boolean
          description: The Transactions page's investment delta reads History rows instead of the ledger (super-admin toggled, PD-052)
        must_change_password:
          type: boolean
          description: Forced onboarding pending (bootstrap super admin)
```

Replacement:

```yaml
        delta_from_history:
          type: boolean
          description: The Transactions page's investment delta reads History rows instead of the ledger (super-admin toggled, PD-052)
        ui_revamp:
          type: boolean
          description: The account sees the glass UI (super-admin toggled, PD-054)
        must_change_password:
          type: boolean
          description: Forced onboarding pending (bootstrap super admin)
```

* [ ] **Step 4: Edit `backend/internal/controllers/admin.go`**

WHY: reuses `setUserFlag`, the shared super-admin switch path, so 403/404 behave exactly like gold, premium and the delta switch.

Current:

```go
    return api.AdminSetUserDeltaFromHistory204Response{}, nil
}

// setUserFlag is the super-admin per-user switch shared by the gold,
// premium and delta-source toggles: load the target in the caller's scope,
// set field to enabled (and updated_at), log it. allowed=false: the caller
```

Replacement:

```go
    return api.AdminSetUserDeltaFromHistory204Response{}, nil
}

// AdminSetUserUiRevamp switches an account to the glass UI (PD-054); off
// (default) keeps the current UI. Super admin only; like gold and premium,
// the super admin may switch their own account.
func (h *Controller) AdminSetUserUiRevamp(ctx context.Context, request api.AdminSetUserUiRevampRequestObject) (api.AdminSetUserUiRevampResponseObject, error) {
    allowed, found, err := h.setUserFlag(ctx, request.Id, "ui_revamp", request.Body.Enabled)
    switch {
    case err != nil:
        return nil, err
    case !allowed:
        return api.AdminSetUserUiRevamp403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
    case !found:
        return api.AdminSetUserUiRevamp404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }
    return api.AdminSetUserUiRevamp204Response{}, nil
}

// setUserFlag is the super-admin per-user switch shared by the gold,
// premium and delta-source toggles: load the target in the caller's scope,
// set field to enabled (and updated_at), log it. allowed=false: the caller
```

* [ ] **Step 5: Edit `backend/internal/controllers/admin_test.go`**

WHY: the switch writes `$set.ui_revamp`, refuses a regional admin (403) and an unknown account (404).

Current:

```go
    })
}

func TestAdminSetUserRegion(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
```

Replacement:

```go
    })
}

// PD-054: the per-user switch to the glass UI, on the shared super-admin
// flag path.
func TestAdminSetUserUiRevamp(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

    mt.Run("super admin switches an account to the glass UI", func(mt *mtest.T) {
        target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
        mt.AddMockResponses(
            mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
            mtest.CreateSuccessResponse(),
        )
        h := newIntegrationHandler(mt, &mockPriceFetcher{})
        resp, err := h.AdminSetUserUiRevamp(userCtx(superAdmin()), api.AdminSetUserUiRevampRequestObject{
            Id:   primitive.NewObjectID().Hex(),
            Body: &api.UserFlagToggleRequest{Enabled: true},
        })
        if err != nil {
            t.Fatalf("AdminSetUserUiRevamp: %v", err)
        }
        if _, ok := resp.(api.AdminSetUserUiRevamp204Response); !ok {
            t.Fatalf("response = %T, want 204", resp)
        }
        updated := false
        for _, event := range mt.GetAllStartedEvents() {
            if event.CommandName == "update" {
                updated = true
                set := event.Command.Lookup("updates").Array().Index(0).Value().Document().Lookup("u", "$set").Document()
                if enabled, ok := set.Lookup("ui_revamp").BooleanOK(); !ok || !enabled {
                    t.Errorf("update $set = %v; want ui_revamp true", set)
                }
            }
        }
        if !updated {
            t.Fatal("no update command sent")
        }
    })

    mt.Run("regional admins cannot switch it", func(mt *mtest.T) {
        h := newIntegrationHandler(mt, &mockPriceFetcher{})
        resp, err := h.AdminSetUserUiRevamp(userCtx(regionalAdmin("india")), api.AdminSetUserUiRevampRequestObject{
            Id:   primitive.NewObjectID().Hex(),
            Body: &api.UserFlagToggleRequest{Enabled: true},
        })
        if err != nil {
            t.Fatalf("AdminSetUserUiRevamp: %v", err)
        }
        if _, ok := resp.(api.AdminSetUserUiRevamp403JSONResponse); !ok {
            t.Fatalf("response = %T, want 403", resp)
        }
    })

    mt.Run("unknown target is a 404", func(mt *mtest.T) {
        mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))
        h := newIntegrationHandler(mt, &mockPriceFetcher{})
        resp, err := h.AdminSetUserUiRevamp(userCtx(superAdmin()), api.AdminSetUserUiRevampRequestObject{
            Id:   primitive.NewObjectID().Hex(),
            Body: &api.UserFlagToggleRequest{Enabled: false},
        })
        if err != nil {
            t.Fatalf("AdminSetUserUiRevamp: %v", err)
        }
        if _, ok := resp.(api.AdminSetUserUiRevamp404JSONResponse); !ok {
            t.Fatalf("response = %T, want 404", resp)
        }
    })
}

func TestAdminSetUserRegion(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
```

* [ ] **Step 6: Edit `backend/internal/domain/user.go`**

WHY: the switch lives on the account, beside `delta_from_history`; `omitempty` keeps existing documents unchanged (absent = off).

Current:

```go
    // DeltaFromHistory switches the Transactions page's investment delta back
    // to History rows (PD-052); omitted = false = computed from the ledger.
    DeltaFromHistory bool `bson:"delta_from_history,omitempty" json:"delta_from_history"`

    LoginFailures            int  `bson:"login_failures" json:"-"`
    SecurityQuestionFailures int  `bson:"security_question_failures" json:"-"`
```

Replacement:

```go
    // DeltaFromHistory switches the Transactions page's investment delta back
    // to History rows (PD-052); omitted = false = computed from the ledger.
    DeltaFromHistory bool `bson:"delta_from_history,omitempty" json:"delta_from_history"`
    // UiRevamp opts an account into the glass UI (PD-054); omitted = false =
    // the current UI.
    UiRevamp bool `bson:"ui_revamp,omitempty" json:"ui_revamp"`

    LoginFailures            int  `bson:"login_failures" json:"-"`
    SecurityQuestionFailures int  `bson:"security_question_failures" json:"-"`
```

* [ ] **Step 7: Edit `backend/internal/httpserver/auth.go`**

WHY: every operation needs a tier entry; super admin, like the other user switches.

Current:

```go
    "PUT /api/admin/users/:id/gold":               tierSuperAdmin,
    "PUT /api/admin/users/:id/premium":            tierSuperAdmin,
    "PUT /api/admin/users/:id/delta-from-history": tierSuperAdmin,
    "PUT /api/admin/branding":                     tierSuperAdmin,

    // Admin or super-admin — every other /api/admin/... route.
```

Replacement:

```go
    "PUT /api/admin/users/:id/gold":               tierSuperAdmin,
    "PUT /api/admin/users/:id/premium":            tierSuperAdmin,
    "PUT /api/admin/users/:id/delta-from-history": tierSuperAdmin,
    "PUT /api/admin/users/:id/ui-revamp":          tierSuperAdmin,
    "PUT /api/admin/branding":                     tierSuperAdmin,

    // Admin or super-admin — every other /api/admin/... route.
```

* [ ] **Step 8: Edit `backend/internal/services/mapper.go`**

WHY: `/auth/me` and the admin user list carry the switch, so the frontend can read it (DD-011 §1).

Current:

```go
        GoldEnabled:        u.GoldEnabled,
        Premium:            u.Premium,
        DeltaFromHistory:   u.DeltaFromHistory,
        MustChangePassword: u.MustChangePassword,
    }
    if out.Username == "" {
```

Replacement:

```go
        GoldEnabled:        u.GoldEnabled,
        Premium:            u.Premium,
        DeltaFromHistory:   u.DeltaFromHistory,
        UiRevamp:           u.UiRevamp,
        MustChangePassword: u.MustChangePassword,
    }
    if out.Username == "" {
```

* [ ] **Step 9: Regenerate `backend/api/models.gen.go`, `backend/api/server.gen.go`**

WHY: generated from the spec; never edited by hand.

```bash
cd backend && go generate -tags tools ./...
```

Expected: only the listed generated files change.

* [ ] **Step 10: Verify**

```bash
cd backend && gofmt -l internal && go build ./... && go test ./internal/controllers/ ./internal/httpserver/ ./internal/services/
```

Expected: no gofmt output; `ok` for all three packages (`TestAdminSetUserUiRevamp`: 3 subtests pass).

* [ ] **Step 11: Commit**

```bash
git add backend/api/models.gen.go backend/api/server.gen.go backend/api/specs/admin/admin.yaml backend/api/specs/openapi.yaml backend/api/specs/portfolio-api.yaml backend/internal/controllers/admin.go backend/internal/controllers/admin_test.go backend/internal/domain/user.go backend/internal/httpserver/auth.go backend/internal/services/mapper.go
git commit -m "✨ Add the per-account glass UI switch" -m "ui_revamp on the user and /auth/me; PUT /admin/users/{id}/ui-revamp on the shared super-admin flag path (PD-054)."
```

---

## Task 2: UI mode, toasts and theme sync

**Files:**

* Create: `frontend/src/components/shell/Toaster.tsx`, `frontend/src/lib/toast.test.tsx`, `frontend/src/lib/toast.ts`, `frontend/src/lib/uiMode.test.tsx`, `frontend/src/lib/uiMode.ts`
* Modify: `frontend/src/components/Icon.tsx`, `frontend/src/components/ThemePicker.tsx`, `frontend/src/features/auth/guardRules.test.ts`, `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/schema.gen.ts`, `frontend/src/lib/useTheme.test.ts`, `frontend/src/lib/useTheme.ts`, `frontend/src/main.tsx`

* [ ] **Step 1: Edit `frontend/src/components/Icon.tsx`**

WHY: three icons for the shell; the file's `p` parameters become `props` for the naming lint (whole-file rule).

Current:

```tsx
  )
}

export const ChartLineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M4 19h16" />
    <path className="icon-market-up icon-motion" d="M6 16V9" />
    <path className="icon-market-down icon-motion" d="M10 16V5" />
```

Replacement:

```tsx
  )
}

export const ChartLineIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M4 19h16" />
    <path className="icon-market-up icon-motion" d="M6 16V9" />
    <path className="icon-market-down icon-motion" d="M10 16V5" />
```

WHY: the same change, next spot in `Icon.tsx`.

Current:

```tsx
  </Svg>
)

export const CoinsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-gold icon-motion" d="M5 16h8l2 4H3l2-4z" />
    <path className="icon-gold-soft icon-motion" d="M11 10h8l2 4H9l2-4z" />
    <path className="icon-gold-soft" d="M8 4h8l2 4H6l2-4z" />
```

Replacement:

```tsx
  </Svg>
)

export const CoinsIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-gold icon-motion" d="M5 16h8l2 4H3l2-4z" />
    <path className="icon-gold-soft icon-motion" d="M11 10h8l2 4H9l2-4z" />
    <path className="icon-gold-soft" d="M8 4h8l2 4H6l2-4z" />
```

WHY: the same change, next spot in `Icon.tsx`.

Current:

```tsx
  </Svg>
)

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M5 4h14v16H5z" />
    <path className="icon-market-up icon-trace" pathLength={18} d="M8 8h8" />
    <path d="M8 12h8" />
```

Replacement:

```tsx
  </Svg>
)

export const ListIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M5 4h14v16H5z" />
    <path className="icon-market-up icon-trace" pathLength={18} d="M8 8h8" />
    <path d="M8 12h8" />
```

WHY: the same change, next spot in `Icon.tsx`.

Current:

```tsx
  </Svg>
)

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path className="icon-admin icon-trace" pathLength={18} d="M9 12l2 2 4-5" />
    <path className="icon-admin icon-motion" d="M12 6v2" />
  </Svg>
)

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle className="icon-user-tone icon-motion" cx="8" cy="8" r="3" />
    <circle className="icon-admin icon-motion" cx="17" cy="9" r="2.5" />
    <path className="icon-muted" d="M3 20a5 5 0 0 1 10 0" />
```

Replacement:

```tsx
  </Svg>
)

export const ShieldIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path className="icon-admin icon-trace" pathLength={18} d="M9 12l2 2 4-5" />
    <path className="icon-admin icon-motion" d="M12 6v2" />
  </Svg>
)

export const UsersIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle className="icon-user-tone icon-motion" cx="8" cy="8" r="3" />
    <circle className="icon-admin icon-motion" cx="17" cy="9" r="2.5" />
    <path className="icon-muted" d="M3 20a5 5 0 0 1 10 0" />
```

WHY: the same change, next spot in `Icon.tsx`.

Current:

```tsx
  </Svg>
)

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle className="icon-user-tone icon-motion" cx="12" cy="8" r="4" />
    <path className="icon-muted" d="M4 21a8 8 0 0 1 16 0" />
    <circle className="icon-user-tone icon-spark" cx="17.5" cy="5.5" r="1.5" />
  </Svg>
)

export const UserCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle className="icon-user-tone icon-motion" cx="9" cy="8" r="3.5" />
    <path className="icon-muted" d="M3 21a6 6 0 0 1 12 0" />
    <path className="icon-success icon-trace" pathLength={18} d="M16 12l2 2 4-5" />
  </Svg>
)

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M12 22s7-7.58 7-13a7 7 0 0 0-14 0c0 5.42 7 13 7 13z" />
    <circle className="icon-user-tone icon-motion" cx="12" cy="9" r="2.5" />
    <path className="icon-user-tone icon-spark" d="M12 4v2" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-spin icon-accent" d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path className="icon-spin" d="M20 4v6h-6" />
    <path className="icon-success icon-spark" d="M12 8v4l3 2" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect className="icon-spark " x="4" y="4" width="16" height="16" rx="5" />
    <path className="icon-spark icon-motion" d="M12 8v8M8 12h8" />
  </Svg>
)

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M4 20h16" />
    <path className="icon-user-tone icon-motion" d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-danger icon-motion" d="M3 6h18" />
    <path className="icon-muted" d="M8 6V4h8v2" />
    <path className="icon-muted" d="M18 6l-1 14H7L6 6" />
```

Replacement:

```tsx
  </Svg>
)

export const UserIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle className="icon-user-tone icon-motion" cx="12" cy="8" r="4" />
    <path className="icon-muted" d="M4 21a8 8 0 0 1 16 0" />
    <circle className="icon-user-tone icon-spark" cx="17.5" cy="5.5" r="1.5" />
  </Svg>
)

export const UserCheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle className="icon-user-tone icon-motion" cx="9" cy="8" r="3.5" />
    <path className="icon-muted" d="M3 21a6 6 0 0 1 12 0" />
    <path className="icon-success icon-trace" pathLength={18} d="M16 12l2 2 4-5" />
  </Svg>
)

export const PinIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M12 22s7-7.58 7-13a7 7 0 0 0-14 0c0 5.42 7 13 7 13z" />
    <circle className="icon-user-tone icon-motion" cx="12" cy="9" r="2.5" />
    <path className="icon-user-tone icon-spark" d="M12 4v2" />
  </Svg>
)

export const RefreshIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-spin icon-accent" d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path className="icon-spin" d="M20 4v6h-6" />
    <path className="icon-success icon-spark" d="M12 8v4l3 2" />
  </Svg>
)

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect className="icon-spark " x="4" y="4" width="16" height="16" rx="5" />
    <path className="icon-spark icon-motion" d="M12 8v8M8 12h8" />
  </Svg>
)

export const EditIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M4 20h16" />
    <path className="icon-user-tone icon-motion" d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const TrashIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-danger icon-motion" d="M3 6h18" />
    <path className="icon-muted" d="M8 6V4h8v2" />
    <path className="icon-muted" d="M18 6l-1 14H7L6 6" />
```

WHY: the same change, next spot in `Icon.tsx`.

Current:

```tsx
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-success icon-trace" pathLength={18} d="M20 6L9 17l-5-5" />
  </Svg>
)

export const AlertTriangleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path className="icon-warning icon-motion" d="M12 9v4" />
    <circle className="icon-warning icon-spark" cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
  </Svg>
)

export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path className="icon-danger icon-motion" d="M16 17l5-5-5-5" />
    <path className="icon-danger icon-motion" d="M21 12H9" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M4 7h16" />
    <path className="icon-muted" d="M4 17h16" />
    <path className="icon-user-tone icon-motion" d="M9 4v6" />
```

Replacement:

```tsx
  </Svg>
)

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-success icon-trace" pathLength={18} d="M20 6L9 17l-5-5" />
  </Svg>
)

export const AlertTriangleIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path className="icon-warning icon-motion" d="M12 9v4" />
    <circle className="icon-warning icon-spark" cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
  </Svg>
)

export const LogOutIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path className="icon-danger icon-motion" d="M16 17l5-5-5-5" />
    <path className="icon-danger icon-motion" d="M21 12H9" />
  </Svg>
)

export const SettingsIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M4 7h16" />
    <path className="icon-muted" d="M4 17h16" />
    <path className="icon-user-tone icon-motion" d="M9 4v6" />
```

WHY: the same change, next spot in `Icon.tsx`.

Current:

```tsx
  </Svg>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M20 12H5" />
    <path className="icon-user-tone icon-motion" d="M12 19l-7-7 7-7" />
  </Svg>
)
```

Replacement:

```tsx
  </Svg>
)

export const ArrowLeftIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M20 12H5" />
    <path className="icon-user-tone icon-motion" d="M12 19l-7-7 7-7" />
  </Svg>
)

// PD-054 glass shell: command palette search, sidebar home, glass switch.
export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle className="icon-accent" cx="11" cy="11" r="7" />
    <path className="icon-muted icon-motion" d="M20 20l-3.5-3.5" />
  </Svg>
)

export const HomeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-muted" d="M3 11l9-7 9 7" />
    <path className="icon-accent" d="M5 10v10h14V10" />
    <path className="icon-user-tone icon-motion" d="M10 20v-5h4v5" />
  </Svg>
)

export const SparkleIcon = (props: IconProps) => (
  <Svg {...props}>
    <path className="icon-spark icon-motion" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path className="icon-accent" d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Svg>
)
```

* [ ] **Step 2: Edit `frontend/src/components/ThemePicker.tsx`**

WHY: a stable `.theme-picker-inline` class lets the shell hide the page header's copy; short names renamed for the lint rule.

Current:

```tsx
// ThemePicker: direct one-click theme selection (no cycling). Rendered
// inside the dashboard's user menu. Page headers use the inline variant,
// which shows the current theme first and opens the options on click. The
// Cyber option appears only for premium accounts.

const OPTIONS: { id: ThemeName; label: string; premiumOnly?: boolean }[] = [
  { id: 'cyberpunk', label: '⚡ Cyber', premiumOnly: true },
```

Replacement:

```tsx
// ThemePicker: direct one-click theme selection (no cycling). Rendered
// inside the dashboard's user menu. Page headers use the inline variant,
// which shows the current theme first and opens the options on click. The
// Cyber option appears only for premium accounts. The inline root carries
// .theme-picker-inline so the glass shell (PD-054), which has its own
// picker, can hide the page header's copy.

const OPTIONS: { id: ThemeName; label: string; premiumOnly?: boolean }[] = [
  { id: 'cyberpunk', label: '⚡ Cyber', premiumOnly: true },
```

WHY: the same change, next spot in `ThemePicker.tsx`.

Current:

```tsx
export default function ThemePicker({ theme, premium, onSelect, variant = 'menu' }: {
  theme: ThemeName
  premium?: boolean
  onSelect: (t: ThemeName) => void
  /** 'menu' = direct choices inside a dropdown; 'inline' = compact page-header dropdown. */
  variant?: 'menu' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const options = OPTIONS.filter(o => !o.premiumOnly || premium)
  const current = OPTIONS.find(o => o.id === theme) ?? OPTIONS[0]
  const buttons = (
    <div role="group" aria-label="Theme" style={{ display: 'flex', gap: 6 }}>
      {options.map(o => {
        const active = theme === o.id
        return (
          <button key={o.id} onClick={() => {
            onSelect(o.id)
            setOpen(false)
          }} aria-pressed={active}
            style={{
```

Replacement:

```tsx
export default function ThemePicker({ theme, premium, onSelect, variant = 'menu' }: {
  theme: ThemeName
  premium?: boolean
  onSelect: (theme: ThemeName) => void
  /** 'menu' = direct choices inside a dropdown; 'inline' = compact page-header dropdown. */
  variant?: 'menu' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const options = OPTIONS.filter(option => !option.premiumOnly || premium)
  const current = OPTIONS.find(option => option.id === theme) ?? OPTIONS[0]
  const buttons = (
    <div role="group" aria-label="Theme" style={{ display: 'flex', gap: 6 }}>
      {options.map(option => {
        const active = theme === option.id
        return (
          <button key={option.id} onClick={() => {
            onSelect(option.id)
            setOpen(false)
          }} aria-pressed={active}
            style={{
```

WHY: the same change, next spot in `ThemePicker.tsx`.

Current:

```tsx
              border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
            }}>
            {o.label}
          </button>
        )
      })}
```

Replacement:

```tsx
              border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
            }}>
            {option.label}
          </button>
        )
      })}
```

WHY: the same change, next spot in `ThemePicker.tsx`.

Current:

```tsx
  if (variant === 'inline') {
    return (
      <div
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
```

Replacement:

```tsx
  if (variant === 'inline') {
    return (
      <div
        className="theme-picker-inline"
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
```

WHY: the same change, next spot in `ThemePicker.tsx`.

Current:

```tsx
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Theme: ${current.label}`}
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
```

Replacement:

```tsx
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Theme: ${current.label}`}
          onClick={() => setOpen(wasOpen => !wasOpen)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
```

WHY: the same change, next spot in `ThemePicker.tsx`.

Current:

```tsx
            }}
          >
            <div style={{ display: 'grid', gap: 6 }}>
              {options.map(o => {
                const active = theme === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onSelect(o.id)
                      setOpen(false)
                    }}
                    style={{
```

Replacement:

```tsx
            }}
          >
            <div style={{ display: 'grid', gap: 6 }}>
              {options.map(option => {
                const active = theme === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onSelect(option.id)
                      setOpen(false)
                    }}
                    style={{
```

WHY: the same change, next spot in `ThemePicker.tsx`.

Current:

```tsx
                      borderRadius: 'var(--radius-sm)', textAlign: 'left',
                    }}
                  >
                    <span>{o.label}</span>
                  </button>
                )
              })}
```

Replacement:

```tsx
                      borderRadius: 'var(--radius-sm)', textAlign: 'left',
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                )
              })}
```

* [ ] **Step 3: Create `frontend/src/components/shell/Toaster.tsx`**

WHY: renders the toast queue as a polite live region, read with `useSyncExternalStore`.

```tsx
import { useSyncExternalStore } from 'react'
import { currentToasts, dismissToast, subscribeToasts } from '../../lib/toast'
import { AlertTriangleIcon, CheckIcon } from '../Icon'

// Toaster renders the toast queue (lib/toast) as glass cards in the
// bottom-right corner. A polite live region, so screen readers announce
// each message without stealing focus.
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts)
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map(queued => (
        <div key={queued.id} className={`toast toast-${queued.tone}`}>
          <span className="toast-icon" aria-hidden>
            {queued.tone === 'error' ? <AlertTriangleIcon size={14} /> : <CheckIcon size={14} />}
          </span>
          <span className="toast-message">{queued.message}</span>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(queued.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
```

* [ ] **Step 4: Edit `frontend/src/features/auth/guardRules.test.ts`**

WHY: `User` now requires `ui_revamp`; the fixture lists every field.

Current:

```ts
  gold_enabled: false,
  premium: false,
  delta_from_history: false,
  ...(over as object),
})
```

Replacement:

```ts
  gold_enabled: false,
  premium: false,
  delta_from_history: false,
  ui_revamp: false,
  ...(over as object),
})
```

* [ ] **Step 5: Edit `frontend/src/lib/api/client.ts`**

WHY: one typed call per switch, as for the other flags.

Current:

```ts
  adminSetUserPremium:  (id: string, body: PremiumToggleRequest) => request<void>('PUT', `/admin/users/${id}/premium`, body),
  adminSetUserDeltaFromHistory: (id: string, body: UserFlagToggleRequest) =>
    request<void>('PUT', `/admin/users/${id}/delta-from-history`, body),
  adminUpdateBranding:  (body: BrandingUpdateRequest) => request<BrandingSettings>('PUT', '/admin/branding', body),

  listGoldTransactions:  () => request<GoldTransaction[]>('GET', '/gold/transactions'),
```

Replacement:

```ts
  adminSetUserPremium:  (id: string, body: PremiumToggleRequest) => request<void>('PUT', `/admin/users/${id}/premium`, body),
  adminSetUserDeltaFromHistory: (id: string, body: UserFlagToggleRequest) =>
    request<void>('PUT', `/admin/users/${id}/delta-from-history`, body),
  adminSetUserUiRevamp: (id: string, body: UserFlagToggleRequest) =>
    request<void>('PUT', `/admin/users/${id}/ui-revamp`, body),
  adminUpdateBranding:  (body: BrandingUpdateRequest) => request<BrandingSettings>('PUT', '/admin/branding', body),

  listGoldTransactions:  () => request<GoldTransaction[]>('GET', '/gold/transactions'),
```

* [ ] **Step 6: Create `frontend/src/lib/toast.test.tsx`**

WHY: toasts expire, render in a live region, dismiss on ×; `notify` alerts in the current UI and toasts in the glass one.

```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetToastsForTests, currentToasts, notify, toast, TOAST_MS } from './toast'
import { Toaster } from '../components/shell/Toaster'

beforeEach(() => __resetToastsForTests())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.ui
})

describe('toasts', () => {
  it('queues a toast and drops it after TOAST_MS', () => {
    vi.useFakeTimers()
    toast('Saved', 'success')
    expect(currentToasts().map(queued => queued.message)).toEqual(['Saved'])
    vi.advanceTimersByTime(TOAST_MS)
    expect(currentToasts()).toEqual([])
  })

  it('renders the queue in a live region and dismisses on ×', async () => {
    render(<Toaster />)
    act(() => { toast('Price refresh failed', 'error') })
    expect(screen.getByRole('status')).toHaveTextContent('Price refresh failed')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Price refresh failed')).toBeNull()
  })

  it('notify keeps the browser alert in the current UI', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    notify('Delete failed')
    expect(alert).toHaveBeenCalledWith('Delete failed')
    expect(currentToasts()).toEqual([])
  })

  it('notify shows a toast in the glass UI', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    document.documentElement.dataset.ui = 'v2'
    notify('Delete failed')
    expect(alert).not.toHaveBeenCalled()
    expect(currentToasts()[0]).toMatchObject({ message: 'Delete failed', tone: 'error' })
  })
})
```

* [ ] **Step 7: Create `frontend/src/lib/toast.ts`**

WHY: a tiny external store, so any code (also outside React) can raise a toast; `notify` keeps `window.alert` for the current UI (DD-011 §5).

```ts
import { isUiV2 } from './uiMode'

// A tiny toast store for the glass UI (PD-054): toast() queues a message,
// the shell's <Toaster> renders the queue, and each toast leaves on its own
// after TOAST_MS. notify() is the drop-in for window.alert: a toast in the
// glass UI, the browser alert everywhere else, so the current UI is unchanged.

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

export const TOAST_MS = 4500

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function dismissToast(id: number) {
  toasts = toasts.filter(queued => queued.id !== id)
  emit()
}

export function toast(message: string, tone: ToastTone = 'info'): number {
  const id = nextId++
  toasts = [...toasts, { id, message, tone }]
  emit()
  setTimeout(() => dismissToast(id), TOAST_MS)
  return id
}

export function notify(message: string, tone: ToastTone = 'error') {
  if (isUiV2()) toast(message, tone)
  else window.alert(message)
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function currentToasts(): Toast[] {
  return toasts
}

// Test-only: empties the queue between cases.
export function __resetToastsForTests() {
  toasts = []
  emit()
}
```

* [ ] **Step 8: Create `frontend/src/lib/uiMode.test.tsx`**

WHY: the attribute follows the switch, survives a reload, follows the signed-in account and is left alone while signed out.

```tsx
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyUiMode, initUiMode, isUiV2, UiModeSync } from './uiMode'

const auth = vi.hoisted(() => ({ value: null as null | { user: { ui_revamp: boolean } | null; loading: boolean } }))
vi.mock('../features/auth/AuthContext', () => ({ useAuthOptional: () => auth.value }))

// jsdom here runs without a storage file, so window.localStorage is absent.
beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
      clear: () => { values.clear() },
    },
  })
})

afterEach(() => {
  delete document.documentElement.dataset.ui
  auth.value = null
})

describe('ui mode', () => {
  it('mirrors the switch to <html data-ui> and remembers it', () => {
    applyUiMode(true)
    expect(document.documentElement.dataset.ui).toBe('v2')
    expect(isUiV2()).toBe(true)
    applyUiMode(false)
    expect(document.documentElement.dataset.ui).toBeUndefined()
    expect(isUiV2()).toBe(false)
  })

  it('applies the remembered mode at boot', () => {
    applyUiMode(true)
    delete document.documentElement.dataset.ui
    initUiMode()
    expect(document.documentElement.dataset.ui).toBe('v2')
  })

  it('follows the signed-in account', () => {
    auth.value = { user: { ui_revamp: true }, loading: false }
    const { rerender } = render(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('v2')

    auth.value = { user: { ui_revamp: false }, loading: false }
    rerender(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBeUndefined()
  })

  it('leaves the remembered mode alone while signed out', () => {
    applyUiMode(true)
    auth.value = { user: null, loading: false }
    render(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('v2')
  })
})
```

* [ ] **Step 9: Create `frontend/src/lib/uiMode.ts`**

WHY: one place mirrors the account's switch to `<html data-ui="v2">` and remembers it, so every glass rule can be scoped under that attribute and signed-out pages keep the last look (DD-011 §2).

```ts
import { useEffect } from 'react'
import { useAuthOptional } from '../features/auth/AuthContext'

// The glass UI (PD-054) is a per-account switch the super admin flips in
// the admin panel (`user.ui_revamp`). It is mirrored to
// <html data-ui="v2"> so every v2 rule in styles/glass.css is scoped under
// that attribute and the current UI stays byte-for-byte as it is for
// everyone else. The last account's choice is kept in localStorage, so the
// login screen after a logout (and the first paint before /auth/me
// answers) keeps the look that account had.

export const UI_V2 = 'v2'
const STORAGE_KEY = 'pd_ui'

export function applyUiMode(revamp: boolean) {
  if (typeof document === 'undefined') return
  if (revamp) document.documentElement.dataset.ui = UI_V2
  else delete document.documentElement.dataset.ui
  try { window.localStorage?.setItem(STORAGE_KEY, revamp ? UI_V2 : '') } catch { /* private mode / jsdom */ }
}

// initUiMode applies the stored mode before first paint (main.tsx).
export function initUiMode() {
  let stored: string | null = null
  try { stored = window.localStorage?.getItem(STORAGE_KEY) ?? null } catch { /* private mode / jsdom */ }
  if (stored === UI_V2) document.documentElement.dataset.ui = UI_V2
}

// isUiV2 reads the live mode, for code outside React (notify).
export function isUiV2(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.ui === UI_V2
}

// useUiRevamp is true when the signed-in account has the glass UI.
export function useUiRevamp(): boolean {
  return Boolean(useAuthOptional()?.user?.ui_revamp)
}

// UiModeSync keeps <html data-ui> in step with the signed-in account. While
// signed out it leaves the stored mode alone.
export function UiModeSync() {
  const auth = useAuthOptional()
  const user = auth?.user
  const loading = auth?.loading ?? true
  useEffect(() => {
    if (!loading && user) applyUiMode(Boolean(user.ui_revamp))
  }, [loading, user])
  return null
}
```

* [ ] **Step 10: Edit `frontend/src/lib/useTheme.test.ts`**

WHY: a pick in one mounted instance reaches the other.

Current:

```ts
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('labels the next theme, cyber only for premium', () => {
    expect(nextThemeLabel('dark', true)).toBe('☀ Light')
    expect(nextThemeLabel('light', true)).toBe('⚡ Cyber')
```

Replacement:

```ts
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  // PD-054: the glass shell's picker and the page's own state (which charts
  // read) are separate instances; a pick in one reaches the other.
  it('keeps every mounted instance on the same theme', () => {
    const shell = renderHook(() => useTheme({ premium: false }))
    const page = renderHook(() => useTheme({ premium: false }))
    act(() => shell.result.current.set('light'))
    expect(page.result.current.theme).toBe('light')
    act(() => page.result.current.set('dark'))
    expect(shell.result.current.theme).toBe('dark')
  })

  it('labels the next theme, cyber only for premium', () => {
    expect(nextThemeLabel('dark', true)).toBe('☀ Light')
    expect(nextThemeLabel('light', true)).toBe('⚡ Cyber')
```

* [ ] **Step 11: Edit `frontend/src/lib/useTheme.ts`**

WHY: the shell's picker and each page's `useTheme` hold separate state; a broadcast keeps them on one theme so charts recolour too (DD-011 §7). Short names renamed for the lint rule.

Current:

```ts
// the premium cyber default must only apply to the latter.
const CHOSEN_KEY = 'pd_theme_chosen'
const THEMES: ThemeName[] = ['dark', 'light', 'cyberpunk']

function readStored(): ThemeName {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = window.localStorage?.getItem(STORAGE_KEY)
    return THEMES.includes(v as ThemeName) ? (v as ThemeName) : 'dark'
  } catch {
    // jsdom or private-mode browsers may throw — default to dark.
    return 'dark'
```

Replacement:

```ts
// the premium cyber default must only apply to the latter.
const CHOSEN_KEY = 'pd_theme_chosen'
const THEMES: ThemeName[] = ['dark', 'light', 'cyberpunk']
// Broadcast on every theme change so all mounted useTheme instances agree.
const THEME_EVENT = 'pd:theme'

function readStored(): ThemeName {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY)
    return THEMES.includes(stored as ThemeName) ? (stored as ThemeName) : 'dark'
  } catch {
    // jsdom or private-mode browsers may throw — default to dark.
    return 'dark'
```

WHY: the same change, next spot in `useTheme.ts`.

Current:

```ts
  useEffect(() => {
    applyTheme(theme)
    try { window.localStorage?.setItem(STORAGE_KEY, theme) } catch { /* private mode / jsdom */ }
  }, [theme])

  // Entitlement fallback: an explicitly non-premium account never renders
  // cyberpunk, even if it was stored while the flag was on.
  useEffect(() => {
```

Replacement:

```ts
  useEffect(() => {
    applyTheme(theme)
    try { window.localStorage?.setItem(STORAGE_KEY, theme) } catch { /* private mode / jsdom */ }
    window.dispatchEvent(new CustomEvent<ThemeName>(THEME_EVENT, { detail: theme }))
  }, [theme])

  // Every mounted picker follows a change made by another one (the glass
  // shell's picker and the page's own state, which charts read, PD-054).
  useEffect(() => {
    const follow = (e: Event) => {
      const next = (e as CustomEvent<ThemeName>).detail
      setTheme(current => (current === next ? current : next))
    }
    window.addEventListener(THEME_EVENT, follow)
    return () => window.removeEventListener(THEME_EVENT, follow)
  }, [])

  // Entitlement fallback: an explicitly non-premium account never renders
  // cyberpunk, even if it was stored while the flag was on.
  useEffect(() => {
```

WHY: the same change, next spot in `useTheme.ts`.

Current:

```ts
    if (premium && !themeChosen() && theme !== 'cyberpunk') setTheme('cyberpunk')
  }, [premium, theme])

  const cycle = premium ? THEMES : THEMES.filter(t => t !== 'cyberpunk')

  return {
    theme,
    toggle: () => {
      markThemeChosen()
      setTheme(t => {
        const i = cycle.indexOf(t)
        return cycle[(i + 1) % cycle.length] ?? 'dark'
      })
    },
    set: (t: ThemeName) => {
      markThemeChosen()
      setTheme(t)
    },
  }
}
```

Replacement:

```ts
    if (premium && !themeChosen() && theme !== 'cyberpunk') setTheme('cyberpunk')
  }, [premium, theme])

  const cycle = premium ? THEMES : THEMES.filter(option => option !== 'cyberpunk')

  return {
    theme,
    toggle: () => {
      markThemeChosen()
      setTheme(current => {
        const i = cycle.indexOf(current)
        return cycle[(i + 1) % cycle.length] ?? 'dark'
      })
    },
    set: (next: ThemeName) => {
      markThemeChosen()
      setTheme(next)
    },
  }
}
```

* [ ] **Step 12: Edit `frontend/src/main.tsx`**

WHY: the remembered mode applies before first paint, like the theme.

Current:

```tsx
import App from './App'
import { initBranding } from './lib/useBranding'
import { initTheme } from './lib/useTheme'
import './index.css'

// Apply the stored theme before first paint so unauthenticated pages
// (login/signup) render in the chosen theme too.
initTheme()
initBranding()

ReactDOM.createRoot(document.getElementById('root')!).render(
```

Replacement:

```tsx
import App from './App'
import { initBranding } from './lib/useBranding'
import { initTheme } from './lib/useTheme'
import { initUiMode } from './lib/uiMode'
import './index.css'

// Apply the stored theme and UI mode before first paint so unauthenticated
// pages (login/signup) render in the chosen theme and look too.
initTheme()
initUiMode()
initBranding()

ReactDOM.createRoot(document.getElementById('root')!).render(
```

* [ ] **Step 13: Regenerate `frontend/src/lib/api/schema.gen.ts`**

WHY: generated from the spec; never edited by hand.

```bash
cd frontend && npm run gen:api
```

Expected: only the listed generated files change.

* [ ] **Step 14: Verify**

```bash
cd frontend && npx tsc --noEmit -p . && npx vitest run src/lib/uiMode.test.tsx src/lib/toast.test.tsx src/lib/useTheme.test.ts src/features/auth/guardRules.test.ts
```

Expected: no type errors; 4 files, 37 tests pass.

* [ ] **Step 15: Commit**

```bash
git add frontend/src/components/Icon.tsx frontend/src/components/ThemePicker.tsx frontend/src/components/shell/Toaster.tsx frontend/src/features/auth/guardRules.test.ts frontend/src/lib/api/client.ts frontend/src/lib/api/schema.gen.ts frontend/src/lib/toast.test.tsx frontend/src/lib/toast.ts frontend/src/lib/uiMode.test.tsx frontend/src/lib/uiMode.ts frontend/src/lib/useTheme.test.ts frontend/src/lib/useTheme.ts frontend/src/main.tsx
git commit -m "✨ Add UI mode, toasts and theme sync for glass" -m "data-ui=v2 follows the account's ui_revamp; notify() toasts in the glass UI and alerts elsewhere; useTheme instances follow each other (PD-054)."
```

---

## Task 3: The app shell and command palette

**Files:**

* Create: `frontend/src/components/shell/AppShell.test.tsx`, `frontend/src/components/shell/AppShell.tsx`, `frontend/src/components/shell/CommandPalette.test.tsx`, `frontend/src/components/shell/CommandPalette.tsx`
* Modify: `frontend/src/App.tsx`

* [ ] **Step 1: Edit `frontend/src/App.tsx`**

WHY: a layout route wraps every signed-in page so the shell appears on all of them; `UiModeSync` sits inside `AuthProvider`.

Current:

```tsx
import AdminManageAdmins from './features/admin/AdminManageAdmins'
import AdminBranding from './features/admin/AdminBranding'
import { BrandingProvider } from './lib/useBranding'

export default function App() {
  return (
    <BrowserRouter>
      <BrandingProvider>
        <AuthProvider>
          <CurrencySprinkle />
          <Routes>
            <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
```

Replacement:

```tsx
import AdminManageAdmins from './features/admin/AdminManageAdmins'
import AdminBranding from './features/admin/AdminBranding'
import { BrandingProvider } from './lib/useBranding'
import { UiModeSync } from './lib/uiMode'
import { ShellLayout } from './components/shell/AppShell'

export default function App() {
  return (
    <BrowserRouter>
      <BrandingProvider>
        <AuthProvider>
          <UiModeSync />
          <CurrencySprinkle />
          <Routes>
            <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
```

WHY: the same change, next spot in `App.tsx`.

Current:

```tsx
            <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
            <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
            <Route path="/dividends" element={<RequireAuth><DividendsPage /></RequireAuth>} />
            <Route path="/history/chart/:region" element={<RequireAuth><HistoryChartPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/gold" element={<RequireGold><GoldPage /></RequireGold>} />

            <Route path="/admin" element={<RequireAdmin><AdminUserList /></RequireAdmin>} />
            <Route path="/admin/users/:id" element={<RequireAdmin><AdminUserView /></RequireAdmin>} />
            <Route path="/admin/users/:id/transactions" element={<RequireAdmin><AdminUserTransactions /></RequireAdmin>} />
            <Route path="/admin/users/:id/dividends" element={<RequireAdmin><AdminUserDividends /></RequireAdmin>} />
            <Route path="/admin/admins" element={<RequireSuperAdmin><AdminManageAdmins /></RequireSuperAdmin>} />
            <Route path="/admin/branding" element={<RequireSuperAdmin><AdminBranding /></RequireSuperAdmin>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
```

Replacement:

```tsx
            <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* Signed-in pages: inside the glass shell for ui_revamp accounts
                (PD-054), on their own for everyone else. */}
            <Route element={<ShellLayout />}>
              <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
              <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
              <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
              <Route path="/dividends" element={<RequireAuth><DividendsPage /></RequireAuth>} />
              <Route path="/history/chart/:region" element={<RequireAuth><HistoryChartPage /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
              <Route path="/gold" element={<RequireGold><GoldPage /></RequireGold>} />

              <Route path="/admin" element={<RequireAdmin><AdminUserList /></RequireAdmin>} />
              <Route path="/admin/users/:id" element={<RequireAdmin><AdminUserView /></RequireAdmin>} />
              <Route path="/admin/users/:id/transactions" element={<RequireAdmin><AdminUserTransactions /></RequireAdmin>} />
              <Route path="/admin/users/:id/dividends" element={<RequireAdmin><AdminUserDividends /></RequireAdmin>} />
              <Route path="/admin/admins" element={<RequireSuperAdmin><AdminManageAdmins /></RequireSuperAdmin>} />
              <Route path="/admin/branding" element={<RequireSuperAdmin><AdminBranding /></RequireSuperAdmin>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
```

* [ ] **Step 2: Create `frontend/src/components/shell/AppShell.test.tsx`**

WHY: the current UI without the switch, current-page marking, Gold/Admin gating, Ctrl+K navigation, Add holding state, log out.

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navItems, ShellLayout } from './AppShell'

const session = vi.hoisted(() => ({
  user: { id: 'u1', username: 'alice', name: 'Alice', role: 'user', gold_enabled: false, premium: false, ui_revamp: true },
  logout: vi.fn(),
}))
vi.mock('../../features/auth/AuthContext', () => ({
  useAuthOptional: () => ({ user: session.user, loading: false, logout: session.logout }),
}))

function Probe() {
  const location = useLocation()
  return <div data-testid="where">{location.pathname} {JSON.stringify(location.state)}</div>
}

function renderShell(path = '/history') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route path="*" element={<Probe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  session.user = { ...session.user, role: 'user', gold_enabled: false, ui_revamp: true }
})

describe('navItems', () => {
  it('offers Gold and Admin only to accounts that have them', () => {
    expect(navItems(false, false).map(item => item.label)).toEqual(['Dashboard', 'History', 'Transactions', 'Dividends'])
    expect(navItems(true, true).map(item => item.label)).toEqual(['Dashboard', 'History', 'Transactions', 'Dividends', 'Gold', 'Admin'])
  })
})

describe('ShellLayout', () => {
  it('renders the page alone for an account without the glass UI', () => {
    session.user = { ...session.user, ui_revamp: false }
    renderShell()
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('/history')
  })

  it('wraps the page in the shell and marks the current page', () => {
    renderShell('/history')
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(sidebar).getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).queryByRole('link', { name: 'Gold' })).toBeNull()
    expect(screen.getByTestId('where')).toBeInTheDocument()
  })

  it('opens the command palette on Ctrl+K and navigates from it', async () => {
    renderShell('/history')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    await userEvent.type(input, 'dividends{Enter}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('/dividends')
  })

  it('sends Add holding to the dashboard with openAdd', async () => {
    renderShell('/history')
    await userEvent.click(screen.getByRole('button', { name: /Add holding/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/ {"openAdd":true}')
  })

  it('logs out from the sidebar', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(session.logout).toHaveBeenCalled()
  })
})
```

* [ ] **Step 3: Create `frontend/src/components/shell/AppShell.tsx`**

WHY: the shell: sidebar, tab bar, palette commands and toaster; `ShellLayout` renders it only for glass accounts (DD-011 §4).

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthOptional } from '../../features/auth/AuthContext'
import { useUiRevamp } from '../../lib/uiMode'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import ThemePicker from '../ThemePicker'
import {
  ChartLineIcon, CoinsIcon, HomeIcon, ListIcon, LogOutIcon, PlusIcon, SearchIcon, ShieldIcon, UserIcon,
} from '../Icon'
import { CommandPalette, type Command } from './CommandPalette'
import { Toaster } from './Toaster'

// The glass UI's app shell (PD-054): a sticky glass sidebar with the page
// navigation, search (⌘K), theme and account, a bottom tab bar on narrow
// screens, the command palette and the toaster. Pages render inside it
// unchanged; their headers become page toolbars, and the copies of what the
// shell already offers (brand, page links, theme picker, user menu) carry
// .shell-dup so glass.css hides them here.

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  keywords?: string
}

export function navItems(goldEnabled: boolean, isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <HomeIcon size={16} />, end: true, keywords: 'home holdings portfolio' },
    { to: '/history', label: 'History', icon: <ChartLineIcon size={16} />, keywords: 'snapshots charts month' },
    { to: '/transactions', label: 'Transactions', icon: <ListIcon size={16} />, keywords: 'ledger trades buys sells import' },
    { to: '/dividends', label: 'Dividends', icon: <CoinsIcon size={16} />, keywords: 'income payouts' },
  ]
  if (goldEnabled) items.push({ to: '/gold', label: 'Gold', icon: <CoinsIcon size={16} />, keywords: 'physical jeweler' })
  if (isAdmin) items.push({ to: '/admin', label: 'Admin', icon: <ShieldIcon size={16} />, keywords: 'users panel switches' })
  return items
}

// ShellLayout wraps the signed-in routes: the shell for glass accounts, the
// page alone (the current UI) for everyone else.
export function ShellLayout() {
  const revamp = useUiRevamp()
  if (!revamp) return <Outlet />
  return <AppShell><Outlet /></AppShell>
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuthOptional()
  const user = auth?.user ?? null
  const navigate = useNavigate()
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const goldEnabled = Boolean(user?.gold_enabled)
  const items = useMemo(() => navItems(goldEnabled, isAdmin), [goldEnabled, isAdmin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(wasOpen => !wasOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands = useMemo<Command[]>(() => {
    const themes: { id: ThemeName; label: string }[] = [
      { id: 'dark', label: 'Dark' },
      { id: 'light', label: 'Light' },
      ...(user?.premium ? [{ id: 'cyberpunk' as ThemeName, label: 'Cyber' }] : []),
    ]
    return [
      ...items.map(item => ({
        id: `go-${item.to}`, group: 'Go to', label: item.label, keywords: item.keywords,
        run: () => navigate(item.to),
      })),
      { id: 'go-profile', group: 'Go to', label: 'Account settings', keywords: 'profile password security', run: () => navigate('/profile') },
      { id: 'add-holding', group: 'Action', label: 'Add holding', keywords: 'new stock buy', run: () => navigate('/', { state: { openAdd: true } }) },
      ...themes.map(option => ({
        id: `theme-${option.id}`, group: 'Theme', label: `${option.label} theme`, keywords: 'appearance colour color',
        run: () => setTheme(option.id),
      })),
      { id: 'log-out', group: 'Account', label: 'Log out', keywords: 'sign out exit', run: () => { void auth?.logout() } },
    ]
  }, [items, navigate, setTheme, user?.premium, auth])

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Main navigation">
        <Link to="/" className="shell-brand">
          <span className="brand-tile" style={{ width: 34, height: 34 }}><ChartLineIcon size={18} /></span>
          <span className="shell-brand-name">Portfolio</span>
        </Link>
        <button type="button" className="shell-search" onClick={() => setPaletteOpen(true)}>
          <SearchIcon size={14} /> <span>Search</span> <kbd>⌘K</kbd>
        </button>
        <nav className="shell-nav">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className="shell-nav-link">
              {item.icon} <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn-primary shell-cta" onClick={() => navigate('/', { state: { openAdd: true } })}>
          <PlusIcon size={14} /> Add holding
        </button>
        <div className="shell-foot">
          <ThemePicker theme={theme} premium={user?.premium} onSelect={setTheme} />
          <NavLink to="/profile" className="shell-nav-link shell-user">
            <UserIcon size={16} /> <span>{user?.name || user?.username}</span>
          </NavLink>
          <button type="button" className="shell-nav-link shell-logout" onClick={() => { void auth?.logout() }}>
            <LogOutIcon size={16} /> <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="shell-content">{children}</div>

      <nav className="shell-tabbar" aria-label="Quick navigation">
        {items.slice(0, 4).map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className="shell-tab">
            {item.icon} <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className="shell-tab" onClick={() => setPaletteOpen(true)}>
          <SearchIcon size={16} /> <span>More</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Toaster />
    </div>
  )
}
```

* [ ] **Step 4: Create `frontend/src/components/shell/CommandPalette.test.tsx`**

WHY: matching, typing + Enter, arrow keys, Escape, the empty state, closed renders nothing.

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette, matchCommands, type Command } from './CommandPalette'

const commands = (runs: Record<string, () => void> = {}): Command[] => [
  { id: 'history', group: 'Go to', label: 'History', keywords: 'snapshots', run: runs.history ?? vi.fn() },
  { id: 'txns', group: 'Go to', label: 'Transactions', keywords: 'ledger trades', run: runs.txns ?? vi.fn() },
  { id: 'dark', group: 'Theme', label: 'Dark theme', run: runs.dark ?? vi.fn() },
]

describe('matchCommands', () => {
  it('needs every word to match the label, group or keywords', () => {
    expect(matchCommands(commands(), '').map(command => command.id)).toEqual(['history', 'txns', 'dark'])
    expect(matchCommands(commands(), 'ledger').map(command => command.id)).toEqual(['txns'])
    expect(matchCommands(commands(), 'go hist').map(command => command.id)).toEqual(['history'])
    expect(matchCommands(commands(), 'theme gold')).toEqual([])
  })
})

describe('CommandPalette', () => {
  it('filters as you type and runs the highlighted command on Enter', async () => {
    const txns = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={commands({ txns })} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    expect(input).toHaveFocus()

    await userEvent.type(input, 'trades{Enter}')
    expect(txns).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('moves the highlight with the arrow keys', async () => {
    const dark = vi.fn()
    render(<CommandPalette open onClose={vi.fn()} commands={commands({ dark })} />)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: /Dark theme/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    expect(dark).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and says when nothing matches', async () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={commands()} />)
    await userEvent.type(screen.getByRole('combobox'), 'zzz')
    expect(screen.getByText('No matching command')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing while closed', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} commands={commands()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

* [ ] **Step 5: Create `frontend/src/components/shell/CommandPalette.tsx`**

WHY: an ARIA combobox + listbox palette; every typed word must match (DD-011 §5).

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SearchIcon } from '../Icon'

// The glass UI's command palette (PD-054): ⌘K / Ctrl+K opens it from any
// page, typing filters the commands (every word must match the label or a
// keyword), arrows move, Enter runs, Escape closes. It follows the ARIA
// combobox + listbox pattern so the active option is announced.

export interface Command {
  id: string
  label: string
  group: string
  keywords?: string
  hint?: string
  run: () => void
}

export function matchCommands(commands: Command[], query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return commands
  return commands.filter(command => {
    const haystack = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase()
    return words.every(word => haystack.includes(word))
  })
}

export function CommandPalette({ open, onClose, commands }: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => matchCommands(commands, query), [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(index => Math.min(index + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(matches[active]) }
  }

  const activeId = matches[active] ? `palette-option-${matches[active].id}` : undefined
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette"
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-search">
          <SearchIcon size={16} />
          <input ref={inputRef} className="palette-input" value={query} placeholder="Jump to a page or run a command…"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={activeId}
            aria-label="Search commands"
            onChange={e => { setQuery(e.target.value); setActive(0) }} />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Commands">
          {matches.length === 0 && <li className="palette-empty">No matching command</li>}
          {matches.map((command, index) => (
            <li key={command.id} id={`palette-option-${command.id}`} role="option" aria-selected={index === active}
              className="palette-option" onMouseEnter={() => setActive(index)} onClick={() => run(command)}>
              <span className="palette-group">{command.group}</span>
              <span className="palette-label">{command.label}</span>
              {command.hint && <kbd>{command.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

* [ ] **Step 6: Verify**

```bash
cd frontend && npx tsc --noEmit -p . && npx vitest run src/components/shell
```

Expected: no type errors; 2 files, 11 tests pass.

* [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/shell/AppShell.test.tsx frontend/src/components/shell/AppShell.tsx frontend/src/components/shell/CommandPalette.test.tsx frontend/src/components/shell/CommandPalette.tsx
git commit -m "✨ Add the glass app shell and command palette" -m "Sidebar, mobile tab bar, Ctrl/Cmd+K palette and toaster around the signed-in routes for glass accounts (PD-054)."
```

---

## Task 4: The glass stylesheet

**Files:**

* Create: `frontend/src/styles/glass.css`
* Modify: `frontend/src/index.css`

* [ ] **Step 1: Edit `frontend/src/index.css`**

WHY: loads the glass layer last, after the shared components.

Current:

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/components.css';

/* Shared page chrome. .page-nav is the sticky glass header every page shell
 * uses (pair with .nav-glass); .page-main is the content container. The
```

Replacement:

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/components.css';
@import './styles/glass.css';

/* Shared page chrome. .page-nav is the sticky glass header every page shell
 * uses (pair with .nav-glass); .page-main is the content container. The
```

* [ ] **Step 2: Create `frontend/src/styles/glass.css`**

WHY: the whole look, scoped under `:root[data-ui="v2"]`: tokens, surfaces, shell, hero, palette, toasts and the reduced-motion / reduced-transparency fallbacks (DD-011 §3).

```css
/* Glass UI (PD-054). Every rule below is scoped under :root[data-ui="v2"]
 * (set by lib/uiMode for accounts with ui_revamp), so the current UI is
 * untouched for everyone else. The one global rule is .shell-only, markup
 * that exists for the glass shell and must stay hidden without it.
 *
 * How it reaches 600+ inline style={{}} objects without rewriting them:
 *  1. Tokens — the inline styles read var(--bg-card), var(--border),
 *     var(--radius)…; v2 redefines those as translucent glass values.
 *  2. Surfaces — anything painted with --bg-card / --bg-secondary (matched
 *     on the inline style text) also gets the backdrop blur, except table
 *     parts, which would blur once per row.
 *  3. Shell — pages render inside .shell (AppShell); their headers become
 *     floating page toolbars and their copies of the shell's controls
 *     (.shell-dup, the header theme picker, back-to-dashboard) are hidden. */

.shell-only { display: none; }

/* --- 1. Tokens ------------------------------------------------------------ */

:root[data-ui="v2"] {
  --bg-primary: #05070f;
  --bg-secondary: rgba(20, 24, 46, 0.52);
  --bg-card: rgba(26, 31, 58, 0.46);
  --bg-card-hover: rgba(44, 51, 92, 0.58);
  --bg-input: rgba(8, 10, 24, 0.55);
  --bg-glass: rgba(14, 17, 34, 0.55);
  --border: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.16);

  --radius: 18px;
  --radius-sm: 12px;
  --radius-lg: 26px;

  --glass-blur: 20px;
  --glass-saturate: 170%;
  --glass-edge: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  --shadow-sm: var(--glass-edge), 0 6px 18px -8px rgba(0, 0, 0, 0.55);
  --shadow: var(--glass-edge), 0 18px 48px -16px rgba(0, 0, 0, 0.65);
  --shadow-lg: var(--glass-edge), 0 40px 90px -24px rgba(0, 0, 0, 0.75);
  --glow-pos: 0 0 18px rgba(0, 214, 159, 0.45);
  --glow-neg: 0 0 18px rgba(255, 92, 122, 0.45);
  --ring: 0 0 0 3px rgba(120, 150, 255, 0.45);

  --mesh-1: rgba(79, 124, 255, 0.34);
  --mesh-2: rgba(139, 92, 246, 0.30);
  --mesh-3: rgba(20, 184, 166, 0.22);
  --mesh-4: rgba(236, 72, 153, 0.18);

  --card-highlight-bg: linear-gradient(135deg, rgba(79, 124, 255, 0.22) 0%, rgba(139, 92, 246, 0.12) 60%, rgba(26, 31, 58, 0.4) 100%);
  --card-highlight-border: rgba(120, 150, 255, 0.4);
  --sidebar-width: 252px;
}

:root[data-ui="v2"][data-theme="light"] {
  --bg-primary: #eef1fa;
  --bg-secondary: rgba(255, 255, 255, 0.55);
  --bg-card: rgba(255, 255, 255, 0.58);
  --bg-card-hover: rgba(255, 255, 255, 0.82);
  --bg-input: rgba(255, 255, 255, 0.7);
  --bg-glass: rgba(255, 255, 255, 0.6);
  --border: rgba(15, 21, 38, 0.08);
  --border-light: rgba(15, 21, 38, 0.16);
  --glass-edge: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --shadow-sm: var(--glass-edge), 0 6px 18px -10px rgba(23, 32, 66, 0.25);
  --shadow: var(--glass-edge), 0 18px 44px -18px rgba(23, 32, 66, 0.3);
  --shadow-lg: var(--glass-edge), 0 40px 80px -28px rgba(23, 32, 66, 0.38);
  --glow-pos: 0 0 14px rgba(11, 158, 108, 0.25);
  --glow-neg: 0 0 14px rgba(220, 38, 73, 0.25);
  --mesh-1: rgba(79, 124, 255, 0.28);
  --mesh-2: rgba(168, 132, 255, 0.24);
  --mesh-3: rgba(45, 212, 191, 0.20);
  --mesh-4: rgba(251, 146, 189, 0.20);
  --card-highlight-bg: linear-gradient(135deg, rgba(79, 124, 255, 0.16) 0%, rgba(255, 255, 255, 0.6) 70%);
  --card-highlight-border: rgba(47, 107, 219, 0.3);
}

:root[data-ui="v2"][data-theme="cyberpunk"] {
  --bg-primary: #04000b;
  --bg-secondary: rgba(30, 8, 58, 0.5);
  --bg-card: rgba(36, 10, 70, 0.44);
  --bg-card-hover: rgba(58, 16, 108, 0.56);
  --bg-input: rgba(10, 2, 24, 0.6);
  --bg-glass: rgba(16, 4, 34, 0.55);
  --border: rgba(194, 107, 255, 0.18);
  --border-light: rgba(0, 229, 255, 0.3);
  --glow-pos: 0 0 20px rgba(0, 255, 163, 0.6);
  --glow-neg: 0 0 20px rgba(255, 46, 108, 0.6);
  --mesh-1: rgba(255, 43, 214, 0.3);
  --mesh-2: rgba(0, 229, 255, 0.24);
  --mesh-3: rgba(122, 43, 217, 0.32);
  --mesh-4: rgba(255, 230, 0, 0.1);
  --card-highlight-bg: linear-gradient(135deg, rgba(255, 43, 214, 0.22) 0%, rgba(0, 229, 255, 0.1) 70%);
  --card-highlight-border: rgba(0, 229, 255, 0.45);
}

/* --- Backdrop: a slow-drifting gradient mesh behind everything ------------ */

:root[data-ui="v2"] body {
  background: var(--bg-primary);
  font-variant-numeric: tabular-nums;
}

:root[data-ui="v2"] body::before {
  inset: -20%;
  background:
    radial-gradient(38% 42% at 18% 20%, var(--mesh-1), transparent 70%),
    radial-gradient(34% 40% at 82% 16%, var(--mesh-2), transparent 70%),
    radial-gradient(40% 44% at 72% 86%, var(--mesh-3), transparent 70%),
    radial-gradient(30% 36% at 12% 88%, var(--mesh-4), transparent 70%);
  filter: blur(40px);
  animation: glass-drift 38s ease-in-out infinite alternate;
}

@keyframes glass-drift {
  0% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(3%, -2%, 0) scale(1.06); }
  100% { transform: translate3d(-2%, 3%, 0) scale(1.02); }
}

/* The per-page art (PD-046) gives way to the mesh. */
:root[data-ui="v2"] .page-art::before,
:root[data-ui="v2"] .page-art::after { display: none; }
:root[data-ui="v2"] .page-art { background: transparent; }

/* --- 2. Surfaces ---------------------------------------------------------- */

:root[data-ui="v2"] .card,
:root[data-ui="v2"] .card-elevated,
:root[data-ui="v2"] .modal-card,
:root[data-ui="v2"] .menu-pop,
:root[data-ui="v2"] .glass-panel,
:root[data-ui="v2"] :is(div, section, aside, header, form)[style*="var(--bg-card)"],
:root[data-ui="v2"] :is(div, section, aside, header, form)[style*="var(--bg-secondary)"] {
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-sm);
}

:root[data-ui="v2"] .glass-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

:root[data-ui="v2"] .card {
  transition: transform var(--speed-slow) var(--ease), box-shadow var(--speed-slow) var(--ease),
    border-color var(--speed) var(--ease), background var(--speed) var(--ease);
}
:root[data-ui="v2"] .card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow);
  border-color: var(--border-light);
}

:root[data-ui="v2"] .card-elevated {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

/* Gains and losses glow; the sign and the ▲/▼ glyph still carry the meaning. */
:root[data-ui="v2"] .pos { text-shadow: var(--glow-pos); }
:root[data-ui="v2"] .neg { text-shadow: var(--glow-neg); }

/* --- Controls ------------------------------------------------------------- */

:root[data-ui="v2"] .btn,
:root[data-ui="v2"] .btn-ghost {
  background: var(--bg-card);
  border-color: var(--border);
  border-radius: 999px;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transition: background var(--speed) var(--ease), border-color var(--speed) var(--ease),
    transform var(--speed) var(--ease), box-shadow var(--speed) var(--ease);
}
:root[data-ui="v2"] .btn:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-light);
  transform: translateY(-1px);
}
:root[data-ui="v2"] .btn:active { transform: translateY(0) scale(0.98); }

:root[data-ui="v2"] .btn-primary {
  border-radius: 999px;
  box-shadow: 0 8px 24px -8px rgba(91, 147, 255, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
:root[data-ui="v2"] .btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 30px -8px rgba(91, 147, 255, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

:root[data-ui="v2"] .btn-icon { border-radius: 999px; }

:root[data-ui="v2"] .seg-group {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
:root[data-ui="v2"] .seg-btn { border-radius: 999px; }
:root[data-ui="v2"] .seg-btn[aria-pressed="true"] {
  background: var(--bg-card-hover);
  box-shadow: var(--shadow-sm);
}

:root[data-ui="v2"] input:not([type="checkbox"]):not([type="radio"]),
:root[data-ui="v2"] select,
:root[data-ui="v2"] textarea {
  transition: border-color var(--speed) var(--ease), box-shadow var(--speed) var(--ease);
}
:root[data-ui="v2"] input:not([type="checkbox"]):not([type="radio"]):focus,
:root[data-ui="v2"] select:focus,
:root[data-ui="v2"] textarea:focus {
  border-color: var(--blue) !important;
  box-shadow: var(--ring);
}

/* --- Tables --------------------------------------------------------------- */

:root[data-ui="v2"] .holdings-table-wrap {
  background: var(--bg-card);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-sm);
}
:root[data-ui="v2"] table tbody tr { background: transparent !important; }
:root[data-ui="v2"] table tbody tr:hover {
  background: var(--bg-card-hover) !important;
  box-shadow: inset 3px 0 0 var(--blue);
}
:root[data-ui="v2"] table td { border-bottom-color: var(--border) !important; }

/* --- Modals and menus ----------------------------------------------------- */

:root[data-ui="v2"] .modal-overlay {
  background: rgba(3, 5, 12, 0.55) !important;
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  backdrop-filter: blur(14px) saturate(140%);
}
:root[data-ui="v2"][data-theme="light"] .modal-overlay { background: rgba(220, 226, 240, 0.5) !important; }
:root[data-ui="v2"] .modal-card {
  border-radius: var(--radius-lg) !important;
  border: 1px solid var(--border-light) !important;
  box-shadow: var(--shadow-lg);
  animation: glass-pop var(--speed-slow) var(--ease);
}

@keyframes glass-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to { opacity: 1; transform: none; }
}

/* --- 3. Shell ------------------------------------------------------------- */

:root[data-ui="v2"] .shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  min-height: 100dvh;
}

:root[data-ui="v2"] .shell-sidebar {
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 14px;
  background: var(--bg-glass);
  border-right: 1px solid var(--border);
  -webkit-backdrop-filter: blur(24px) saturate(var(--glass-saturate));
  backdrop-filter: blur(24px) saturate(var(--glass-saturate));
  z-index: 60;
}

:root[data-ui="v2"] .shell-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
:root[data-ui="v2"] .shell-brand .brand-tile { border-radius: 11px; box-shadow: 0 6px 20px -6px rgba(91, 147, 255, 0.8); }

:root[data-ui="v2"] .shell-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}
:root[data-ui="v2"] .shell-search:hover { border-color: var(--border-light); color: var(--text-secondary); }
:root[data-ui="v2"] .shell-search span { flex: 1; text-align: left; }

:root[data-ui="v2"] kbd {
  font-family: inherit;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  color: var(--text-muted);
  background: var(--bg-card);
}

:root[data-ui="v2"] .shell-nav { display: flex; flex-direction: column; gap: 2px; }

:root[data-ui="v2"] .shell-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--speed) var(--ease), color var(--speed) var(--ease);
}
:root[data-ui="v2"] .shell-nav-link:hover { background: var(--bg-card); color: var(--text-primary); }
:root[data-ui="v2"] .shell-nav-link[aria-current="page"] {
  background: linear-gradient(90deg, rgba(91, 147, 255, 0.2), rgba(139, 92, 246, 0.08));
  border-color: rgba(120, 150, 255, 0.25);
  color: var(--text-primary);
}
:root[data-ui="v2"] .shell-nav-link[aria-current="page"]::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px;
  background: var(--gradient-brand);
  box-shadow: 0 0 12px rgba(91, 147, 255, 0.9);
}

:root[data-ui="v2"] .shell-cta { justify-content: center; }

:root[data-ui="v2"] .shell-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
:root[data-ui="v2"] .shell-foot > div:first-child { border-top: none !important; padding: 4px 4px 8px !important; }
:root[data-ui="v2"] .shell-logout:hover { color: var(--red); }

:root[data-ui="v2"] .shell-content { min-width: 0; padding-bottom: 32px; }
:root[data-ui="v2"] .shell-content > * { animation: glass-rise 0.45s var(--ease) both; }

@keyframes glass-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

/* Page headers become floating page toolbars. */
:root[data-ui="v2"] .shell .page-nav {
  position: sticky;
  top: 12px;
  margin: 12px 20px 0;
  padding: 0 18px;
  height: 60px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-glass);
  box-shadow: var(--shadow);
}
:root[data-ui="v2"] .shell .nav-glass:not(.page-nav) { background: transparent; border-bottom: none; }
:root[data-ui="v2"] .shell .shell-dup,
:root[data-ui="v2"] .shell .page-nav .theme-picker-inline,
:root[data-ui="v2"] .shell .page-nav a.btn-icon[href="/"] { display: none !important; }
:root[data-ui="v2"] .shell .shell-only { display: block; }
:root[data-ui="v2"] .shell .page-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 8px 0 0;
  white-space: nowrap;
}
:root[data-ui="v2"] .shell .admin-tabs > div { padding-top: 20px !important; }
:root[data-ui="v2"] .shell .page-main { padding: 22px 20px; }

:root[data-ui="v2"] .page-toolbar {
  padding: 12px 14px;
  border-radius: var(--radius-lg) !important;
  background: var(--bg-card);
  border: 1px solid var(--border);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-sm);
}

/* Mobile: the sidebar folds into a bottom tab bar. */
:root[data-ui="v2"] .shell-tabbar { display: none; }

@media (max-width: 860px) {
  :root[data-ui="v2"] .shell { grid-template-columns: minmax(0, 1fr); }
  :root[data-ui="v2"] .shell-sidebar { display: none; }
  :root[data-ui="v2"] .shell-content { padding-bottom: 88px; }
  :root[data-ui="v2"] .shell .page-nav { margin: 8px 10px 0; top: 8px; padding: 0 12px; }
  :root[data-ui="v2"] .shell .page-main { padding: 16px 10px; }
  :root[data-ui="v2"] .shell-tabbar {
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom));
    z-index: 80;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding: 6px;
    border-radius: 22px;
    background: var(--bg-glass);
    border: 1px solid var(--border-light);
    -webkit-backdrop-filter: blur(24px) saturate(var(--glass-saturate));
    backdrop-filter: blur(24px) saturate(var(--glass-saturate));
    box-shadow: var(--shadow-lg);
  }
  :root[data-ui="v2"] .shell-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 2px;
    border-radius: 16px;
    color: var(--text-muted);
    font-size: 10px;
    text-decoration: none;
    background: transparent;
    border: none;
  }
  :root[data-ui="v2"] .shell-tab[aria-current="page"] { color: var(--text-primary); background: var(--bg-card-hover); }
}

/* --- Dashboard hero --------------------------------------------------------- */

:root[data-ui="v2"] .hero {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
  gap: 18px 28px;
  align-items: center;
  padding: 24px 28px;
  margin-bottom: 18px;
  background: var(--card-highlight-bg), var(--bg-card);
  border-color: var(--card-highlight-border);
}
:root[data-ui="v2"] .hero-label,
:root[data-ui="v2"] .hero-chip-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
:root[data-ui="v2"] .hero-value {
  font-size: clamp(30px, 4vw, 44px);
  font-weight: 750;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-top: 6px;
  background: linear-gradient(180deg, var(--text-primary), color-mix(in srgb, var(--text-primary) 70%, transparent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
:root[data-ui="v2"] .hero-sub { color: var(--text-secondary); font-size: 14px; margin-top: 2px; }
:root[data-ui="v2"] .hero-chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
:root[data-ui="v2"] .hero-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid var(--border);
}
:root[data-ui="v2"] .hero-chip.pos { border-color: color-mix(in srgb, var(--green) 40%, transparent); box-shadow: var(--glow-pos); text-shadow: none; }
:root[data-ui="v2"] .hero-chip.neg { border-color: color-mix(in srgb, var(--red) 40%, transparent); box-shadow: var(--glow-neg); text-shadow: none; }
:root[data-ui="v2"] .hero-chip.pos .hero-chip-value { color: var(--green); }
:root[data-ui="v2"] .hero-chip.neg .hero-chip-value { color: var(--red); }
:root[data-ui="v2"] .hero-chip-value { font-size: 17px; font-weight: 700; }
:root[data-ui="v2"] .hero-chip-value small { font-size: 12px; font-weight: 600; opacity: 0.85; }
:root[data-ui="v2"] .hero-split { grid-column: 1 / -1; }
:root[data-ui="v2"] .hero-split-bar {
  display: flex;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  gap: 3px;
  background: var(--bg-input);
}
:root[data-ui="v2"] .hero-split-bar span { border-radius: 999px; }
:root[data-ui="v2"] .hero-split-inr { background: linear-gradient(90deg, #ff9933, #ffb366); }
:root[data-ui="v2"] .hero-split-eur { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
:root[data-ui="v2"] .hero-split-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--text-secondary); }
:root[data-ui="v2"] .hero-split-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }

@media (max-width: 860px) {
  :root[data-ui="v2"] .hero { grid-template-columns: 1fr; padding: 18px; }
  :root[data-ui="v2"] .hero-chips { justify-content: flex-start; }
}

/* --- Command palette ---------------------------------------------------------- */

:root[data-ui="v2"] .palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background: rgba(3, 5, 12, 0.5);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  animation: fade-in var(--speed) var(--ease);
}
:root[data-ui="v2"][data-theme="light"] .palette-overlay { background: rgba(220, 226, 240, 0.5); }
:root[data-ui="v2"] .palette {
  width: min(620px, 100%);
  border-radius: var(--radius-lg);
  background: var(--bg-glass);
  border: 1px solid var(--border-light);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  backdrop-filter: blur(28px) saturate(180%);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: glass-pop var(--speed-slow) var(--ease);
}
:root[data-ui="v2"] .palette-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}
:root[data-ui="v2"] .palette-input {
  flex: 1;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
}
:root[data-ui="v2"] .palette-list { list-style: none; max-height: 52vh; overflow-y: auto; padding: 6px; }
:root[data-ui="v2"] .palette-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
}
:root[data-ui="v2"] .palette-option[aria-selected="true"] { background: var(--bg-card-hover); color: var(--text-primary); }
:root[data-ui="v2"] .palette-group { min-width: 64px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
:root[data-ui="v2"] .palette-label { flex: 1; font-size: 14px; }
:root[data-ui="v2"] .palette-empty { padding: 18px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* --- Toasts ------------------------------------------------------------------- */

:root[data-ui="v2"] .toaster {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 250;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 36px));
}
:root[data-ui="v2"] .toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-glass);
  border: 1px solid var(--border-light);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  backdrop-filter: blur(22px) saturate(170%);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  animation: glass-pop var(--speed-slow) var(--ease);
}
:root[data-ui="v2"] .toast-success .toast-icon { color: var(--green); }
:root[data-ui="v2"] .toast-error .toast-icon { color: var(--red); }
:root[data-ui="v2"] .toast-info .toast-icon { color: var(--blue); }
:root[data-ui="v2"] .toast-message { flex: 1; }
:root[data-ui="v2"] .toast-close { background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; line-height: 1; }

@media (max-width: 860px) {
  :root[data-ui="v2"] .toaster { left: 18px; right: 18px; bottom: 96px; width: auto; }
}

/* --- Skeletons ---------------------------------------------------------------- */

:root[data-ui="v2"] .skeleton {
  background: linear-gradient(90deg, var(--bg-card) 20%, var(--bg-card-hover) 50%, var(--bg-card) 80%);
  background-size: 200% 100%;
  border-radius: 999px;
}

/* --- Accessibility and fallbacks ---------------------------------------------- */

@media (prefers-reduced-motion: reduce) {
  :root[data-ui="v2"] body::before,
  :root[data-ui="v2"] .shell-content > *,
  :root[data-ui="v2"] .modal-card,
  :root[data-ui="v2"] .palette,
  :root[data-ui="v2"] .toast { animation: none; }
  :root[data-ui="v2"] .card:hover,
  :root[data-ui="v2"] .btn:hover { transform: none; }
}

/* No backdrop blur, or the user asks for less transparency: solid surfaces. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root[data-ui="v2"] { --bg-card: #171b2e; --bg-secondary: #121524; --bg-glass: #0e1122; }
  :root[data-ui="v2"][data-theme="light"] { --bg-card: #ffffff; --bg-secondary: #ffffff; --bg-glass: #ffffff; }
}
@media (prefers-reduced-transparency: reduce) {
  :root[data-ui="v2"] { --bg-card: #171b2e; --bg-secondary: #121524; --bg-glass: #0e1122; --bg-input: #0d101f; }
  :root[data-ui="v2"][data-theme="light"] { --bg-card: #ffffff; --bg-secondary: #ffffff; --bg-glass: #ffffff; --bg-input: #ffffff; }
}
```

* [ ] **Step 3: Verify**

```bash
cd frontend && npm run build
```

Expected: `✓ built` (the existing chunk-size warning is unchanged); the CSS parses.

* [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/styles/glass.css
git commit -m "💄 Add the glass stylesheet" -m "Every rule scoped under :root[data-ui=v2]: translucent tokens, blur, gradient mesh, shell, hero, palette, toasts, fallbacks (PD-054)."
```

---

## Task 5: The pages

**Files:**

* Create: `frontend/src/components/PortfolioHero.test.tsx`, `frontend/src/components/PortfolioHero.tsx`
* Modify: `frontend/src/features/admin/AdminShell.tsx`, `frontend/src/features/admin/AdminUserList.test.tsx`, `frontend/src/features/admin/AdminUserList.tsx`, `frontend/src/features/dashboard/DashboardPage.test.tsx`, `frontend/src/features/dashboard/DashboardPage.tsx`, `frontend/src/features/history/HistoryPage.tsx`, `frontend/src/features/transactions/TransactionsPage.tsx`

* [ ] **Step 1: Create `frontend/src/components/PortfolioHero.test.tsx`**

WHY: the value split, the chips (including a currency with no close and one not held), the loading skeleton.

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PortfolioHero, valueSplit } from './PortfolioHero'
import type { HoldingWithPreviousClose } from '../features/holdings/dashboardPriceMovement'

const held = (currency: string, currentValue: number) =>
  ({ id: `${currency}-${currentValue}`, currency, current_value: currentValue }) as HoldingWithPreviousClose

const summary = { total_current_value: 120000, total_current_value_eur: 1320, total_cost: 100000, total_unrealized: 20000 }

describe('valueSplit', () => {
  it('shares the INR-denominated current value between currencies', () => {
    expect(valueSplit([held('INR', 300), held('EUR', 100), held('INR', 0)])).toEqual([
      { currency: 'INR', value: 300, share: 0.75 },
      { currency: 'EUR', value: 100, share: 0.25 },
    ])
    expect(valueSplit([])).toEqual([])
  })
})

describe('PortfolioHero', () => {
  it('shows the value, each held currency today and the unrealised gain', () => {
    render(<PortfolioHero summary={summary} loading={false} holdings={[held('INR', 90000), held('EUR', 30000)]}
      dayChange={{ INR: { gain: 1500, previousValue: 100000, pct: 1.5 }, EUR: null }} />)
    expect(screen.getByText('₹1,20,000.00')).toBeInTheDocument()
    expect(screen.getByText('Today · INR').parentElement).toHaveTextContent('+₹1,500.00 +1.50%')
    expect(screen.getByText('Today · EUR').parentElement).toHaveTextContent('—')
    expect(screen.getByText('Unrealised').parentElement).toHaveTextContent('+₹20,000.00 +20.00%')
    expect(screen.getByRole('img', { name: 'INR 75%, EUR 25%' })).toBeInTheDocument()
  })

  it('leaves out a currency that is not held', () => {
    render(<PortfolioHero summary={summary} loading={false} holdings={[held('INR', 90000)]}
      dayChange={{ INR: { gain: -200, previousValue: 1000, pct: -20 } }} />)
    expect(screen.queryByText('Today · EUR')).toBeNull()
    expect(screen.getByText('Today · INR').parentElement).toHaveClass('neg')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows a skeleton while the first summary loads', () => {
    render(<PortfolioHero summary={null} loading holdings={[]} dayChange={{}} />)
    expect(screen.getByLabelText('Loading portfolio')).toHaveAttribute('aria-busy', 'true')
  })
})
```

* [ ] **Step 2: Create `frontend/src/components/PortfolioHero.tsx`**

WHY: the dashboard hero reads the same summary and per-currency day change as the cards, so the two never disagree (DD-011 §6).

```tsx
import type { Summary } from '../types'
import type { GroupDayChange, HoldingWithPreviousClose } from '../features/holdings/dashboardPriceMovement'
import { formatMoney } from '../lib/currency'

// The glass dashboard's hero panel (PD-054): the portfolio's current value
// in large type, today's move per currency as glowing chips, the unrealised
// gain, and the INR/EUR split of the value as a labelled bar. It reads the
// same summary and the same per-currency day change the cards below use,
// so the two never disagree. Signs and labels carry the meaning; colour
// only reinforces it.

export interface HeroDayChange {
  INR?: GroupDayChange | null
  EUR?: GroupDayChange | null
}

export interface ValueSplit {
  currency: 'INR' | 'EUR'
  value: number
  share: number
}

// valueSplit is each currency's share of the stocks' current value. Every
// holding's current_value is INR-denominated (the backend converts EUR
// positions), so the shares compare like for like.
export function valueSplit(holdings: HoldingWithPreviousClose[]): ValueSplit[] {
  const totals = { INR: 0, EUR: 0 }
  for (const holding of holdings) {
    const value = holding.current_value ?? 0
    if (value <= 0) continue
    if (holding.currency === 'EUR') totals.EUR += value
    else totals.INR += value
  }
  const sum = totals.INR + totals.EUR
  if (sum <= 0) return []
  return (['INR', 'EUR'] as const)
    .filter(currency => totals[currency] > 0)
    .map(currency => ({ currency, value: totals[currency], share: totals[currency] / sum }))
}

const signed = (amount: number, currency: string) => `${amount > 0 ? '+' : ''}${formatMoney(amount, currency)}`
const signedPct = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
const tone = (amount: number) => (amount > 0 ? 'pos' : amount < 0 ? 'neg' : '')

export function PortfolioHero({ summary, loading, holdings, dayChange }: {
  summary: Summary | null
  loading: boolean
  holdings: HoldingWithPreviousClose[]
  dayChange: HeroDayChange
}) {
  if (!summary) {
    if (!loading) return null
    return (
      <section className="hero glass-panel" aria-busy="true" aria-label="Loading portfolio">
        <div className="skeleton" style={{ width: 120, height: 12 }} />
        <div className="skeleton" style={{ width: 280, height: 40, marginTop: 12 }} />
        <div className="skeleton" style={{ width: '60%', height: 10, marginTop: 20 }} />
      </section>
    )
  }

  const cost = summary.total_cost ?? 0
  const unrealised = summary.total_unrealized ?? 0
  const unrealisedPct = cost > 0 ? (unrealised / cost) * 100 : null
  const split = valueSplit(holdings)
  const chips = (['INR', 'EUR'] as const).filter(currency => dayChange[currency] !== undefined)

  return (
    <section className="hero glass-panel" aria-label="Portfolio overview">
      <div className="hero-main">
        <div className="hero-label">Current value</div>
        <div className="hero-value mono">{formatMoney(summary.total_current_value ?? 0, 'INR')}</div>
        <div className="hero-sub mono">{formatMoney(summary.total_current_value_eur ?? 0, 'EUR')}</div>
      </div>

      <div className="hero-chips">
        {chips.map(currency => {
          const change = dayChange[currency]
          return (
            <div key={currency} className={`hero-chip ${change ? tone(change.gain) : ''}`}>
              <span className="hero-chip-label">Today · {currency}</span>
              <span className="hero-chip-value mono">
                {change ? signed(change.gain, currency) : '—'}
                {change && change.pct !== null && <small> {signedPct(change.pct)}</small>}
              </span>
            </div>
          )
        })}
        <div className={`hero-chip ${tone(unrealised)}`}>
          <span className="hero-chip-label">Unrealised</span>
          <span className="hero-chip-value mono">
            {signed(unrealised, 'INR')}
            {unrealisedPct !== null && <small> {signedPct(unrealisedPct)}</small>}
          </span>
        </div>
      </div>

      {split.length > 1 && (
        <div className="hero-split">
          <div className="hero-split-bar" role="img"
            aria-label={split.map(part => `${part.currency} ${Math.round(part.share * 100)}%`).join(', ')}>
            {split.map(part => (
              <span key={part.currency} className={`hero-split-${part.currency.toLowerCase()}`}
                style={{ width: `${part.share * 100}%` }} />
            ))}
          </div>
          <div className="hero-split-legend">
            {split.map(part => (
              <span key={part.currency}>
                <i className={`hero-split-dot hero-split-${part.currency.toLowerCase()}`} aria-hidden />
                {part.currency} {Math.round(part.share * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
```

* [ ] **Step 3: Edit `frontend/src/features/admin/AdminShell.tsx`**

WHY: the shell already has the brand, account, theme and log out, so it hides this header and keeps the tabs, which gain a title.

Current:

```tsx

  return (
    <div className="page-art page-art-admin page-art-users" style={{ minHeight: '100vh' }}>
      <header className="nav-glass page-nav">

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
```

Replacement:

```tsx

  return (
    <div className="page-art page-art-admin page-art-users" style={{ minHeight: '100vh' }}>
      {/* The glass shell (PD-054) already has the brand, account, theme and
          log out, so it hides this header (.shell-dup) and keeps the tabs. */}
      <header className="nav-glass page-nav shell-dup">

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
```

WHY: the same change, next spot in `AdminShell.tsx`.

Current:

```tsx
        </div>
      </header>

      <div className="nav-glass">
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 28px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn-icon" aria-label="My portfolio" title="My portfolio">
            <ArrowLeftIcon size={14} />
          </Link>
          {/* NavLink stamps aria-current="page" when active; the shared
              .btn[aria-current="page"] rule paints the pill. */}
          <NavLink to="/admin" end className="btn">
```

Replacement:

```tsx
        </div>
      </header>

      <div className="nav-glass admin-tabs">
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 28px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn-icon shell-dup" aria-label="My portfolio" title="My portfolio">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 className="shell-only page-title">Admin</h1>
          {/* NavLink stamps aria-current="page" when active; the shared
              .btn[aria-current="page"] rule paints the pill. */}
          <NavLink to="/admin" end className="btn">
```

* [ ] **Step 4: Edit `frontend/src/features/admin/AdminUserList.test.tsx`**

WHY: on, off, and the self-refresh.

Current:

```tsx
    adminListUsers: vi.fn().mockImplementation(() => Promise.resolve([rowUser])),
    getRegions: vi.fn().mockResolvedValue([{ id: 'india', label: 'India' }]),
    adminSetUserDeltaFromHistory: vi.fn().mockResolvedValue(undefined),
  },
}))
```

Replacement:

```tsx
    adminListUsers: vi.fn().mockImplementation(() => Promise.resolve([rowUser])),
    getRegions: vi.fn().mockResolvedValue([{ id: 'india', label: 'India' }]),
    adminSetUserDeltaFromHistory: vi.fn().mockResolvedValue(undefined),
    adminSetUserUiRevamp: vi.fn().mockResolvedValue(undefined),
  },
}))
```

WHY: the same change, next spot in `AdminUserList.test.tsx`.

Current:

```tsx
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)

    // All plain actions share the same class set (uniform size/colour).
    for (const name of ['Unlock', 'Hide', 'Promote', 'Move region', 'Enable gold', 'Enable premium', 'Delta from History']) {
      const el = await screen.findByRole('button', { name })
      expect(el, `${name} button`).toHaveClass('btn', 'btn-sm')
    }
```

Replacement:

```tsx
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)

    // All plain actions share the same class set (uniform size/colour).
    for (const name of ['Unlock', 'Hide', 'Promote', 'Move region', 'Enable gold', 'Enable premium', 'Delta from History', 'Glass UI on']) {
      const el = await screen.findByRole('button', { name })
      expect(el, `${name} button`).toHaveClass('btn', 'btn-sm')
    }
```

WHY: the same change, next spot in `AdminUserList.test.tsx`.

Current:

```tsx
    await waitFor(() => expect(refreshCaller).toHaveBeenCalledTimes(1))
    expect(api.adminSetUserDeltaFromHistory).toHaveBeenCalledWith('sa1', { enabled: true })
  })
})
```

Replacement:

```tsx
    await waitFor(() => expect(refreshCaller).toHaveBeenCalledTimes(1))
    expect(api.adminSetUserDeltaFromHistory).toHaveBeenCalledWith('sa1', { enabled: true })
  })

  // PD-054: the glass UI is opt-in per account.
  it('switches an account to the glass UI and back', async () => {
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    const on = await screen.findByRole('button', { name: 'Glass UI on' })
    expect(on).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(on)
    await waitFor(() => expect(api.adminSetUserUiRevamp).toHaveBeenCalledWith('u1', { enabled: true }))
    expect(refreshCaller).not.toHaveBeenCalled()
  })

  it('turns the glass UI off for an account that has it', async () => {
    vi.mocked(api.adminListUsers).mockResolvedValueOnce([{ ...rowUser, ui_revamp: true }])
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Glass UI off' }))
    await waitFor(() => expect(api.adminSetUserUiRevamp).toHaveBeenCalledWith('u1', { enabled: false }))
  })

  it('refreshes the signed-in user after switching their own look', async () => {
    vi.mocked(api.adminListUsers).mockResolvedValueOnce([{ ...superAdmin, ui_revamp: false }])
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Glass UI on' }))
    await waitFor(() => expect(refreshCaller).toHaveBeenCalledTimes(1))
  })
})
```

* [ ] **Step 5: Edit `frontend/src/features/admin/AdminUserList.tsx`**

WHY: the super admin's **Glass UI on/off** per account; on your own account the session refreshes so the look flips at once; errors go through `notify`.

Current:

```tsx
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useAuth } from '../auth/AuthContext'
import { AdminShell } from './AdminShell'

type StatusFilter = 'active' | 'all'
```

Replacement:

```tsx
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useAuth } from '../auth/AuthContext'
import { notify, toast } from '../../lib/toast'
import { AdminShell } from './AdminShell'

type StatusFilter = 'active' | 'all'
```

WHY: the same change, next spot in `AdminUserList.tsx`.

Current:

```tsx
      await fn()
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
```

Replacement:

```tsx
      await fn()
      await load()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
```

WHY: the same change, next spot in `AdminUserList.tsx`.

Current:

```tsx
                            {listedUser.delta_from_history ? 'Delta from ledger' : 'Delta from History'}
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm btn-danger" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminDeleteUser(listedUser.id), `Permanently delete ${listedUser.username} and all their holdings? This cannot be undone.`)}>
```

Replacement:

```tsx
                            {listedUser.delta_from_history ? 'Delta from ledger' : 'Delta from History'}
                          </button>
                        )}
                        {isSuper && (
                          // PD-054: the glass UI is opt-in per account. On the
                          // caller's own account the session user is refreshed, so
                          // the look flips without a page reload.
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            aria-pressed={Boolean(listedUser.ui_revamp)}
                            onClick={() => runAction(listedUser.id, async () => {
                              await api.adminSetUserUiRevamp(listedUser.id, { enabled: !listedUser.ui_revamp })
                              if (isSelf) await refreshCaller()
                              toast(`${listedUser.ui_revamp ? 'Current UI' : 'Glass UI'} on for ${listedUser.username}`, 'success')
                            })}>
                            {listedUser.ui_revamp ? 'Glass UI off' : 'Glass UI on'}
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm btn-danger" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminDeleteUser(listedUser.id), `Permanently delete ${listedUser.username} and all their holdings? This cannot be undone.`)}>
```

* [ ] **Step 6: Edit `frontend/src/features/dashboard/DashboardPage.test.tsx`**

WHY: the mock now offers `useAuthOptional`; hero only for glass, `.shell-dup` and its act-as exemption, `openAdd` and its act-as guard.

Current:

```tsx
import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DashboardPage, { dividendIncome } from './DashboardPage'
import type { HoldingWithPrice } from '../../types'
import type { GroupDayChange } from '../holdings/dashboardPriceMovement'
```

Replacement:

```tsx
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardPage, { dividendIncome } from './DashboardPage'
import type { HoldingWithPrice } from '../../types'
import type { GroupDayChange } from '../holdings/dashboardPriceMovement'
```

WHY: the same change, next spot in `DashboardPage.test.tsx`.

Current:

```tsx
// The holdings the mocked hook returns, and the props SummaryCards got.
const dashboard = vi.hoisted(() => ({
  enriched: [] as unknown[],
  summaryProps: null as null | { computedDayChangeInr?: GroupDayChange | null; computedDayChangeEur?: GroupDayChange | null },
}))

vi.mock('../holdings/useHoldings', () => ({
  useHoldings: () => ({
    holdings: [], enriched: dashboard.enriched, summary: null,
    loadingHoldings: false, loadingPrices: false, lastRefresh: null,
    refresh: vi.fn(), fetchPrices: vi.fn(), remove: vi.fn(),
  }),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1', username: 'alice', name: 'Alice', role: 'admin',
      region: 'india', gold_enabled: true, premium: false,
    },
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/api/client', () => ({
  api: {
```

Replacement:

```tsx
// The holdings the mocked hook returns, and the props SummaryCards got.
const dashboard = vi.hoisted(() => ({
  enriched: [] as unknown[],
  summary: null as unknown,
  uiRevamp: false,
  summaryProps: null as null | { computedDayChangeInr?: GroupDayChange | null; computedDayChangeEur?: GroupDayChange | null },
}))

vi.mock('../holdings/useHoldings', () => ({
  useHoldings: () => ({
    holdings: [], enriched: dashboard.enriched, summary: dashboard.summary,
    loadingHoldings: false, loadingPrices: false, lastRefresh: null,
    refresh: vi.fn(), fetchPrices: vi.fn(), remove: vi.fn(),
  }),
}))

vi.mock('../auth/AuthContext', () => {
  const session = () => ({
    user: {
      id: 'u1', username: 'alice', name: 'Alice', role: 'admin',
      region: 'india', gold_enabled: true, premium: false, ui_revamp: dashboard.uiRevamp,
    },
    loading: false,
    logout: vi.fn(),
  })
  return { useAuth: session, useAuthOptional: session }
})

vi.mock('../holdings/AddEditModal', () => ({ default: () => <div role="dialog" aria-label="Add holding" /> }))

vi.mock('../../lib/api/client', () => ({
  api: {
```

WHY: the same change, next spot in `DashboardPage.test.tsx`.

Current:

```tsx
  })
})

describe('dividendIncome', () => {
  it('buckets like the backend: blank is INR, USD is in neither line', () => {
    const holdings = [
```

Replacement:

```tsx
  })
})

describe('DashboardPage in the glass UI (PD-054)', () => {
  afterEach(() => {
    dashboard.uiRevamp = false
    dashboard.summary = null
  })

  it('shows the hero only for a glass account', () => {
    dashboard.summary = { total_current_value: 1000, total_current_value_eur: 11, total_cost: 800, total_unrealized: 200 }
    const { unmount } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.queryByLabelText('Portfolio overview')).toBeNull()
    unmount()

    dashboard.uiRevamp = true
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.getByLabelText('Portfolio overview')).toBeInTheDocument()
  })

  it('marks the header copies of the shell controls, but keeps act-as links', () => {
    const { container, unmount } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const header = container.querySelector('header')!
    expect(within(header).getByRole('link', { name: /History/ })).toHaveClass('shell-dup')
    unmount()

    const actAs = render(<MemoryRouter><DashboardPage actAsUserId="u2" actAsLabel="bob" /></MemoryRouter>)
    const actAsHeader = actAs.container.querySelector('header')!
    expect(within(actAsHeader).getByRole('link', { name: /Transactions/ })).not.toHaveClass('shell-dup')
  })

  it('opens Add holding when the shell sends openAdd', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/', state: { openAdd: true } }]}>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('dialog', { name: 'Add holding' })).toBeInTheDocument()
  })

  it('ignores openAdd in act-as views', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/users/u2', state: { openAdd: true } }]}>
        <DashboardPage actAsUserId="u2" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog', { name: 'Add holding' })).toBeNull()
  })
})

describe('dividendIncome', () => {
  it('buckets like the backend: blank is INR, USD is in neither line', () => {
    const holdings = [
```

* [ ] **Step 7: Edit `frontend/src/features/dashboard/DashboardPage.tsx`**

WHY: the hero for glass accounts, a page title, header copies marked `.shell-dup` (page links only outside act-as), the palette's `openAdd`, and `notify` for the delete error.

Current:

```tsx
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import SummaryCards from '../../components/SummaryCards'
import { type GoldMetrics } from '../../lib/api/client'
import HoldingsByCurrency from '../holdings/HoldingsByCurrency'
import AddEditModal from '../holdings/AddEditModal'
```

Replacement:

```tsx
import { useEffect, useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SummaryCards from '../../components/SummaryCards'
import { PortfolioHero } from '../../components/PortfolioHero'
import { useUiRevamp } from '../../lib/uiMode'
import { notify } from '../../lib/toast'
import { type GoldMetrics } from '../../lib/api/client'
import HoldingsByCurrency from '../holdings/HoldingsByCurrency'
import AddEditModal from '../holdings/AddEditModal'
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
  const [menuOpen, setMenuOpen] = useState(false)
  const [regionLabel, setRegionLabel] = useState<string>('')
  const [openingPromptSkipped, setOpeningPromptSkipped] = useState(false)

  // Holdings with an opening balance but no opening date set yet. Only prompt on
  // the caller's own dashboard (the admin act-as holdings endpoint isn't
```

Replacement:

```tsx
  const [menuOpen, setMenuOpen] = useState(false)
  const [regionLabel, setRegionLabel] = useState<string>('')
  const [openingPromptSkipped, setOpeningPromptSkipped] = useState(false)
  const revamp = useUiRevamp()
  const location = useLocation()
  const navigate = useNavigate()
  // In the glass shell (PD-054) the brand, page links and user menu live in
  // the sidebar, so the header's copies are hidden there. In act-as the page
  // links stay: they point at the target user's pages, the sidebar's don't.
  const shellDup = actAsUserId ? '' : ' shell-dup'

  // The shell's "Add holding" (sidebar button, command palette) lands here
  // with state.openAdd; open the modal once and clear the state so a reload
  // or back navigation doesn't reopen it.
  const openAdd = Boolean((location.state as { openAdd?: boolean } | null)?.openAdd)
  useEffect(() => {
    if (!openAdd || actAsUserId) return
    setModal('add')
    navigate(location.pathname, { replace: true, state: null })
  }, [openAdd, actAsUserId, navigate, location.pathname])

  // Holdings with an opening balance but no opening date set yet. Only prompt on
  // the caller's own dashboard (the admin act-as holdings endpoint isn't
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holding?')) return
    try { await remove(id) }
    catch (e) { alert('Delete failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  // Display enriched if available, else fall back to plain holdings
```

Replacement:

```tsx
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holding?')) return
    try { await remove(id) }
    catch (e) { notify('Delete failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  // Display enriched if available, else fall back to plain holdings
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
  return (
    <div className="page-art page-art-dashboard" style={{ minHeight: '100dvh' }}>
      <header className="dash-nav page-nav nav-glass">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div className="brand-tile" style={{ width: 32, height: 32 }}><ChartLineIcon size={18} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Portfolio Dashboard</span>
          </Link>
          {roleBadge}
          {regionLabel && (
            <span style={{
```

Replacement:

```tsx
  return (
    <div className="page-art page-art-dashboard" style={{ minHeight: '100dvh' }}>
      <header className="dash-nav page-nav nav-glass">
          <Link to="/" className="shell-dup" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div className="brand-tile" style={{ width: 32, height: 32 }}><ChartLineIcon size={18} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Portfolio Dashboard</span>
          </Link>
          <h1 className="shell-only page-title">{actAsLabel ? `${actAsLabel}'s portfolio` : 'Portfolio'}</h1>
          {roleBadge}
          {regionLabel && (
            <span style={{
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
              display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}><PinIcon size={12} /> {regionLabel}</span>
          )}
          <span aria-hidden style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <Link to="/history" className="btn dash-nav-btn">
            <ChartLineIcon size={14} /> <span className="dash-nav-label-sm">History</span>
          </Link>
          {/* Target-aware: this header is also what AdminUserView renders in
```

Replacement:

```tsx
              display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}><PinIcon size={12} /> {regionLabel}</span>
          )}
          <span aria-hidden className={shellDup} style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <Link to="/history" className={`btn dash-nav-btn${shellDup}`}>
            <ChartLineIcon size={14} /> <span className="dash-nav-label-sm">History</span>
          </Link>
          {/* Target-aware: this header is also what AdminUserView renders in
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
              actAsUserId and show the admin's OWN ledger under the target
              user's name. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/transactions` : '/transactions'}
            className="btn dash-nav-btn">
            <ListIcon size={14} /> <span className="dash-nav-label-sm">Transactions</span>
          </Link>
          {/* Target-aware for act-as, same rule as Transactions above. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/dividends` : '/dividends'}
            className="btn dash-nav-btn">
            <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Dividends</span>
          </Link>
          {!actAsUserId && user?.gold_enabled && (
            <Link to="/gold" className="btn dash-nav-btn">
              <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Gold</span>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="btn dash-nav-btn">
              <ShieldIcon size={14} /> <span className="dash-nav-label-sm">Admin Panel</span>
            </Link>
          )}
```

Replacement:

```tsx
              actAsUserId and show the admin's OWN ledger under the target
              user's name. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/transactions` : '/transactions'}
            className={`btn dash-nav-btn${shellDup}`}>
            <ListIcon size={14} /> <span className="dash-nav-label-sm">Transactions</span>
          </Link>
          {/* Target-aware for act-as, same rule as Transactions above. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/dividends` : '/dividends'}
            className={`btn dash-nav-btn${shellDup}`}>
            <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Dividends</span>
          </Link>
          {!actAsUserId && user?.gold_enabled && (
            <Link to="/gold" className="btn dash-nav-btn shell-dup">
              <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Gold</span>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="btn dash-nav-btn shell-dup">
              <ShieldIcon size={14} /> <span className="dash-nav-label-sm">Admin Panel</span>
            </Link>
          )}
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
          <button onClick={() => setModal('add')} className="btn-primary dash-nav-btn">
            <PlusIcon size={14} /> <span className="dash-nav-label-sm">Add Holding</span>
          </button>
          <div className="dash-nav-user" style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(wasOpen => !wasOpen)} className="btn dash-nav-btn"
              style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
              <UserIcon size={14} /> <span className="dash-nav-label-sm">{user?.name || user?.username}</span>
```

Replacement:

```tsx
          <button onClick={() => setModal('add')} className="btn-primary dash-nav-btn">
            <PlusIcon size={14} /> <span className="dash-nav-label-sm">Add Holding</span>
          </button>
          <div className="dash-nav-user shell-dup" style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(wasOpen => !wasOpen)} className="btn dash-nav-btn"
              style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
              <UserIcon size={14} /> <span className="dash-nav-label-sm">{user?.name || user?.username}</span>
```

WHY: the same change, next spot in `DashboardPage.tsx`.

Current:

```tsx
          </div>
        )}

        <SummaryCards
          summary={summary}
          loading={loadingPrices}
```

Replacement:

```tsx
          </div>
        )}

        {revamp && (
          <PortfolioHero summary={summary} loading={loadingPrices} holdings={enriched}
            dayChange={computedDayChangeByCurrency} />
        )}

        <SummaryCards
          summary={summary}
          loading={loadingPrices}
```

* [ ] **Step 8: Edit `frontend/src/features/history/HistoryPage.tsx`**

WHY: the filter bar becomes a glass toolbar (the class is inert in the current UI).

Current:

```tsx
      </header>

      <main className="page-main" style={{ width: '100%', maxWidth: '1800px', margin: '0 auto' }}>
        <section style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Year</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
```

Replacement:

```tsx
      </header>

      <main className="page-main" style={{ width: '100%', maxWidth: '1800px', margin: '0 auto' }}>
        <section className="page-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Year</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
```

* [ ] **Step 9: Edit `frontend/src/features/transactions/TransactionsPage.tsx`**

WHY: the filter bar becomes a glass toolbar (the class is inert in the current UI).

Current:

```tsx
        </p>

        {/* Filters */}
        <section style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '13px 14px',
          display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end',
```

Replacement:

```tsx
        </p>

        {/* Filters */}
        <section className="page-toolbar" style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '13px 14px',
          display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end',
```

* [ ] **Step 10: Verify**

```bash
cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run lint:changed
```

Expected: no type errors; 49 files, 500 tests pass; lint:changed reports no problems.

* [ ] **Step 11: Commit**

```bash
git add frontend/src/components/PortfolioHero.test.tsx frontend/src/components/PortfolioHero.tsx frontend/src/features/admin/AdminShell.tsx frontend/src/features/admin/AdminUserList.test.tsx frontend/src/features/admin/AdminUserList.tsx frontend/src/features/dashboard/DashboardPage.test.tsx frontend/src/features/dashboard/DashboardPage.tsx frontend/src/features/history/HistoryPage.tsx frontend/src/features/transactions/TransactionsPage.tsx
git commit -m "✨ Rework the pages for the glass UI" -m "Dashboard hero, header copies hidden in the shell, admin Glass UI switch, page toolbars (PD-054)."
```

---

## Task 6: End-to-end verification, then PR2

**Files:** none

* [ ] **Step 1: Run an isolated stack**: the backend on `:8091` against a
  throwaway database (`MONGODB_DATABASE=pd054_glass`; the name comes from
  that variable, not from the URI) with an unreachable `POSTGRES_URI`, and
  Vite on another port proxying to it. Sign up a test user there, set
  `ui_revamp: true` on it, add a few INR and EUR holdings.

* [ ] **Step 2: Scenarios** (Chrome, 1440 × 900 and 390 × 844)

1. **Shell**: every signed-in page sits in the shell; the current page is
   marked; Gold and Admin appear only for accounts that have them.
2. **Dashboard**: the hero shows the current value, today per currency with
   its percentage and the INR/EUR split; the cards below agree with it.
3. **Palette**: ⌘K / Ctrl+K opens it, typing filters, Enter navigates,
   **Add holding** opens the add dialog on the dashboard, Escape closes.
4. **Themes**: dark, light (and cyber for premium) all stay readable; a
   theme picked in the sidebar recolours the page's charts.
5. **Phone**: the sidebar becomes a bottom tab bar; the hero stacks.
6. **Switch**: as the super admin, **Glass UI off** on the user: their
   next page load is the current UI, with no `data-ui` on `<html>`, even
   though the browser remembered `v2`; **Glass UI on** on your own account
   flips your look without a reload.
7. **Current UI**: with the switch off, the dashboard matches `main`.

* [ ] **Step 3: Record and ship**: drop the throwaway database, then:

```bash
git push -u origin feat/PD-054-glass-ui
gh pr create --base main --head feat/PD-054-glass-ui --title "✨ Add a glass UI that the super admin switches on per account" --body-file pr2.md
```

PR2's body includes the line `FE/BE-EXCEPTION: owner asked for one PR
(PD-054)` and a curl block for the switch.

Expected: all seven pass before PR2 merges.

## Done

* Every signed-in page has a glass shell: sidebar, phone tab bar, command
  palette and toasts, for accounts the super admin switches on.
* The dashboard has a hero panel; page headers are floating toolbars;
  filters, tables, modals and menus are glass.
* Everyone else sees the current UI, unchanged.
* Reduced motion and reduced transparency are respected.

Next: run it for a while on chosen accounts, then decide whether the glass
UI becomes the default and the current one is retired.

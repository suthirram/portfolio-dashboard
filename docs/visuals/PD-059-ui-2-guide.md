# PD-059: UI_2.0 visual review guide

* Status: Draft visual companion; production implementation is not complete
* Owner: project owner
* Updated: 2026-11-18
* Product requirements: [PRD-015](../prds/PRD-015-ui-2.md)
* Technical design: [DD-015](../designs/DD-015-ui-2.md)
* Rollout: [PD-059](../plans/PD-059-ui-2.md)
* Coordination: [status board](../plans/PD-059-ui-2-status.md)
* Annotated frames: [PD-059-ui-2.html](PD-059-ui-2.html)
* Original reference: [PD-059-ui-2-reference.html](PD-059-ui-2-reference.html)

## 1. Purpose and authority

The annotated HTML follows the existing visual-spec convention: a standalone
page with numbered frames, explanations tied to the PRD/DD, three themes,
desktop/tablet/phone artboard widths and a frame-to-slice mapping. Open it
directly; it needs neither a server nor a build step to view.

It packages the local handoff reviewed through PR #332 commit `70e8ff3`, plus
the owner's subsequent instructions to retain the original sidebar, cover the
User/Admin/Super admin perspectives, expose Branding, and explore additional
Google Fonts. These later presentation decisions must be reflected in the
relevant plan amendment before implementation. In particular, the sidebar
decision supersedes the older top-navigation illustration in the draft shell.

This is **not production markup**. The existing APIs, financial definitions,
permissions, ledger replay and validation remain authoritative. The artifact
does not approve a backend schema change, deployment or production migration.

## 2. How to review

1. Open [the annotated visual spec](PD-059-ui-2.html).
2. Choose a numbered frame. Its annotations explain the behavior, reused paths
   and linked specification sections.
3. Compare Light, Dark and Cyber. Standard-user frames correctly fall back to
   Dark when Cyber is selected without Premium.
4. Choose 1280, 768 or 390 px. The artboard scrolls inside its own stage; its
   original sidebar changes to the existing drawer at narrow widths.
5. Use the embedded preview controls and dialogs. **Reset frame** returns to
   its fictional initial state. No sample edit reaches the actual application.
6. Record product gaps in the PD-059 status board; do not infer a new source,
   missing value, classification or financial fallback from the mockup.

## 3. Frame catalogue

| Frame | Surface | Plan slices | Main review points |
| --- | --- | --- | --- |
| [01](PD-059-ui-2.html#frame-01) | Shared shell / Overview | 2–7 | Original sidebar, compact cards, dialogs, one conversion rate |
| [02](PD-059-ui-2.html#frame-02) | Holding details | 5–6, 15 | Metrics and edit/ledger/delete actions in the dialog; existing entry fields |
| [03](PD-059-ui-2.html#frame-03) | Overall performance | 8–10 | INR + EUR + gold, stored FX, INR/EUR display, periods and daily movement |
| [04](PD-059-ui-2.html#frame-04) | Unavailable overall valuation | 8, 10–12 | Missing first FX, carried FX, unpriced gold, Gold service unavailable |
| [05](PD-059-ui-2.html#frame-05) | History / FX re-fetch | 11–14 | Snapshot ledger, legend below table, failed re-fetch and Not now |
| [06](PD-059-ui-2.html#frame-06) | Transactions | 15–17 | Multi-select facets, 15-row paging, native-currency subtotals, inline delta |
| [07](PD-059-ui-2.html#frame-07) | Dividends / import | 18–19 | Currency scope, upload/paste, header-only examples, retained server matching |
| [08](PD-059-ui-2.html#frame-08) | Gold | 20–21 | All 15 columns plus Actions, full Details, metrics, daily/month price review |
| [09](PD-059-ui-2.html#frame-09) | Super admin / accounts | 1–2, 22–24 | Features, one interface picker, roles/regions, protected account, act-as |
| [10](PD-059-ui-2.html#frame-10) | Regional Admin | 22–23 | Region-scoped users, access actions, no super-admin controls |
| [11](PD-059-ui-2.html#frame-11) | Standard User | 2–7, 25 | Own portfolio, no Administration/Branding/Cyber access |
| [12](PD-059-ui-2.html#frame-12) | Premium User | 2–3 | Cyber eligibility, brief entrance, reduced-motion requirement |
| [13](PD-059-ui-2.html#frame-13) | Branding | 24 | Discoverable sidebar entry, font specimens, local apply/reset |
| [14](PD-059-ui-2.html#frame-14) | Own Profile | 25 | Viewer identity, password and all-three security-question flows |

Frames are review identifiers, not claims that a slice has shipped. The status
board controls task ownership, dependencies and the amendments required before
later waves start. Signup, forgot-password and onboarding visuals in slice 26
remain a separate Light-theme review; login stays as #330.

## 4. Decisions and production boundaries

### Sidebar, modes and themes

* Preserve the original sidebar and mobile drawer. Do not move them into a
  top-navigation layout. No Ambient toggle or command palette in UI_2.0.
* Super admin assigns exactly one `classic`, `glass` or `ui2` mode per account.
  Classic and Glass stay intact; unfinished UI_2.0 pages retain their fallback.
* Cyber is premium-gated, with reduced-motion-aware load/selection animation.

### Overall valuation and History

* Overall worth combines INR and EUR stock buckets at the day's stored
  `eur_inr`, plus physical gold added on read. No USD bucket/display mode.
* Missing required FX or unpriced held gold produces unavailable amounts,
  never zero or a cost-price substitution. A failed Gold read cannot produce
  a stock-only figure presented as the complete overall value.
* Known carried FX remains valued and flagged; user-triggered re-fetch on own
  History rows resolves flags. No manual rates, automatic guessing or act-as
  re-fetch. Failed days remain flagged; Not now skips the visit.
* Keep flow-adjusted daily movement, computed before weekly thinning.
  History stays a snapshot ledger with its existing period card, paste format,
  per-stock breakdown, charts and full-history page.
* `portfolio_overall` has a read-only API. Existing snapshot write paths keep
  it in step. The backfill is additive, resumable and owner-gated; repair and
  dry-run behavior require backend verification, not screenshots.

### Ledgers and Gold

* Transaction facets are multi-select; paging is 15 rows with reset on filter
  or sort changes. Corporate events and their fields remain. Investment delta
  stays inline, with separate cash-flow and invested-balance axes.
* Trade/dividend upload and paste retain their original parsers, limits,
  matching decisions and server validation. Load example supplies only the
  header and format hint. Keep dividend currency/cumulative semantics.
* Show all 15 Gold data columns in order plus Actions, and all 15 in Details.
  Retain all eight metric surfaces, nulls, purchase CRUD, date overwrite,
  recent 30 rates, all-month review and the existing missing-price prompt.

### Roles and Branding

* User, premium User, regional Admin and Super admin are explicit review
  scenarios, not a production role-switch feature.
* Regional Admin does not gain feature switches, interface management,
  promotion/demotion, administrator management or Branding access. Preserve
  region, self and owner protections.
* Act-as persists only across its supported Overview/Transactions/Dividends
  paths; Gold remains outside scope, and exit clears the viewed account.
* The current production font catalogue is Roboto and JetBrains Mono.
  DM Sans, Manrope, Inter, Source Sans 3, Lato, Nunito Sans and IBM Plex Sans
  are additional **local design options** requested by the owner. Adopting them
  in production requires the Branding slice's amendment and dependency review.
  Local font selection does not change the real application's branding.

## 5. Sources, offline export and verification

The HTML embeds the local handoff's fictional preview, plus palette tokens
copied from `frontend/src/styles/tokens.css`. It removes external font imports
and disables the preview's Google Fonts loader for this export. The document
can therefore be opened offline with readable system fallbacks and without
automatic network requests. The original reference HTML is retained separately.

The tracked [builder](tools/build_ui2_spec.py) reads the reference HTML above,
the [frame template](tools/PD-059-ui-2.template.html) and the palette tokens.
Rebuild from a fresh checkout with Python 3; no local `handoff/` is required:

```bash
python3 docs/visuals/tools/build_ui2_spec.py
```

The local preview's syntax and DOM interaction checks cover holding dialogs,
valuation states, History FX/paste, pagination/filter reset, imports, Gold
columns/Details, role visibility, protected accounts, act-as and Branding
apply/reset. Native browser layout, downloaded-font appearance, focus return,
reduced motion, live APIs and financial replay are not inferred from those
checks. Browser inspection was blocked by unavailable computer-use permission
in this session; no screenshot or live-path success is claimed.

The visual companion also passed JavaScript parsing, all 14 frame initializers,
role/valuation assertions, frame annotation selection, theme/width controls and
an intercepted resource-loading check with zero requests. Its embedded token
copy and reproducible output were checked. These are DOM checks with simulated
dialog methods, not native iframe layout/focus verification.

Rebuild the artifact after updating the tracked reference or visual template.
Before a
production implementation is accepted, run its repository-required checks and
the relevant real-browser and dev-stack scenarios from PD-059.

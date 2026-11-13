# Local preview server and missing Playwright browser

* Status: Preview serving and approved Chrome table verification resolved
* Last verified: 2026-11-13
* Environment: macOS, restricted agent sandbox, local HTML design preview
* Related: [Cookbook](README.md)

## Problem and trigger

An attempted Playwright preview check failed before loading the page:

```text
browserType.launch: Executable doesn't exist at <playwright-cache>/chromium_headless_shell-<revision>/...
```

Using the installed Chrome channel also failed inside the sandbox, with
`SIGABRT` and `kill EPERM`. The owner deferred headless-browser permission
until after manual preview review. No visual or interaction pass was claimed.

Starting a local HTTP preview server in the sandbox then returned
`PermissionError: [Errno 1] Operation not permitted` at socket bind. A sandboxed
curl also could not reach the server started outside that sandbox.

## Reproduction and diagnostic aids

Check the error's executable path against the installed Playwright version.
A missing cached revision is distinct from a browser-launch permission failure.
Check for installed Chrome before proposing another browser download.

For serving a local preview, substitute the actual directory and filename:

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory '<preview-directory>'
curl --fail --max-time 3 --output /dev/null --write-out '%{http_code}\n' \
  http://127.0.0.1:8766/PD-056-holding-sectors.html
```

## Cause and evidence

Playwright requested a browser revision absent from its cache. A separate
restricted-process launch failed for installed Chrome. Automated browser
execution was not subsequently authorized, so its recovery remains unverified.
The preview server's stack trace identified a denied socket bind; running the
same server command with approved escalation succeeded.

## Solution

With approval, run the static server outside the agent sandbox, bound only to
`127.0.0.1` and serving the preview directory. Verify the URL from the same
approved execution context; sandboxed localhost failure alone does not prove
the server is down. Keep the server running while the owner reviews it.

After owner confirmation, request approval for the needed browser check. In this
session the later table-overflow investigation received approval and successfully
used installed Chrome with an isolated temporary profile; no browser download
was needed. Before approval, the native browser supported manual preview review.

## Verification

Observed HTTP `200` from
`http://127.0.0.1:8766/PD-056-holding-sectors.html` using the approved execution
context. The server exposes fictional design-preview data, not portfolio data.
Later authorized Chrome table checks passed at 1440 px and 390 px in both
layouts, with screenshots inspected. Chart and review-dialog interactions were
not covered by those table geometry checks.

## Follow-up

Continue collecting UI feedback. Keep unverified interactions distinct from
the approved table checks. Stop the preview server when review is complete.

## Frontend fixture routing (2026-11-13)

A Playwright check of the implemented sector tables initially rendered a blank
page. Browser console evidence: `Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "application/json"`.

Cause: the fixture matcher `**/api/**` also matched the Vite source module
`/src/lib/api/client.ts`, returning JSON instead of JavaScript. Match only the
endpoint prefix when mocking API calls:

```javascript
await page.route(url => url.pathname.startsWith('/api/'), async route => {
  // Return the fixture for the requested API endpoint only.
})
```

After correcting the fixture, Chrome checks passed for both holdings layouts,
legacy/glass UI, all three themes, and 1440/390/320 px. Identity cells remained
pinned at the start/middle/end of horizontal scrolling, with opaque backgrounds
and reachable actions. Desktop and narrow screenshots were inspected. The
reference visual's chart navigation, Review later, fund confirmation, narrow
dialog and Escape dismissal also passed. These checks used fictional API
responses, not a real database or deployed dev stack.

The subsequent review check found the dashboard Add Holding button lost its
accessible name on narrow screens: its label span is hidden by responsive CSS
and its icon is aria-hidden. An explicit `aria-label="Add Holding"` preserves
the name at every width. The review browser check locates it by role/name at
320 px, so it exercises the same control keyboard and screen-reader users use.

Review verification subsequently passed for own and act-as flows, including
debounced stale-response handling, explicit post-save fund confirmation without
duplicate creation, owner-only label suggestions, focus trapping/restoration,
and all themes at 1440/390/320 px. The act-as fixture must return the requested
target's id from its user endpoint; returning the caller's id caused an initial
route assertion failure in the fixture, corrected without changing app routing.
Preview uses fictional in-memory data; this does not verify deployed auth or
database persistence. The owner reviewed the local preview and requested
tighter columns and a right-aligned layout switch; both adjustments were applied.

Settled screenshot inspection then found that a dialog could be focusable yet
outside the viewport. Legacy page effects and the glass shell's transformed
containers establish a containing block for fixed-position descendants. The
holding form and classification dialog now use React portals to `document.body`,
escaping those containers while retaining the existing theme selectors and
focus behavior. Browser checks now assert the dialog's full bounding rectangle
fits the viewport; focusability alone is insufficient evidence of visibility.
Narrow screenshots in both UI modes were inspected after entry animations
finished. No database or deployment changes were needed.

## Allocation helper naming and Vite cache (2026-11-13)

Adding `SectorAllocation.tsx` beside `sectorAllocation.ts` caused TypeScript
TS1261/TS1192 on this case-insensitive filesystem: extensionless component
imports selected the helper rather than the component. Renaming the helper to
`sectorAllocationData.ts` and updating imports fixed typecheck and build.

The already-running Vite process retained its old resolution even on a fresh
page load. Browser evidence: `SectorAllocation.ts does not provide an export
named default`. Restarting only the isolated Vite process on port 3016 cleared
the stale module path; the dashboard rendered again. Preserve any user-owned
server on other ports. Future new component/helper pairs should have distinct
basenames, not just different capitalization or extensions.

After the restart, chart checks passed in legacy/glass, all themes, and
1440/390/320 px. They verify the 60/20/20 denominator, EUR-native values,
unpriced warning, no profile request on Sectors selection, keyboard legend and
pointer navigation, preserved All/Nil views and sibling groups, and selected
headings visibly below the responsive header. Desktop/narrow screenshots were
inspected. Pointer tests click an actual donut arc: a path's bounding-box
center can fall in the donut hole, where the surrounding SVG receives the click.
These remain fictional-data checks; deployed provider/auth/database verification
is still pending in PD-056.

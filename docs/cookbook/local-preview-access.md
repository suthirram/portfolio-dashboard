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

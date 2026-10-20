# Verifying a deployment

How to confirm a merge to `main` actually reached production — and how to find
the real error when it didn't.

Written after a three-week outage in which **every** backend deploy failed
while `main` stayed green ([#197](https://github.com/suthirram/portfolio-dashboard/pull/197)).
The traps below are the ones that hid it, not hypotheticals.

Stack and auto-deploy triggers: [deployment.md](deployment.md).

## 0. The constants

```bash
API=https://portfolio-dashboard-api-361268533788.europe-west1.run.app
SERVICE=portfolio-dashboard-api
REGION=europe-west1
```

| Tier | Deploys when | Verify with |
|---|---|---|
| Backend (Cloud Run) | push to `main` touching `backend/**` | §1–§3 |
| Frontend (Cloudflare Pages) | every push to `main` | §4 |

A **frontend-only** PR never redeploys the API. That asymmetry is how a new
page ships while the endpoint it calls does not.

## 1. Watch the GitHub job

```bash
gh run watch "$(gh run list --workflow=deploy-cloudrun.yml --limit 1 \
  --json databaseId --jq '.[0].databaseId')" --exit-status
```

`--exit-status` makes it scriptable (non-zero on failure).

History, to see whether this is a one-off or a run of red:

```bash
gh run list --workflow=deploy-cloudrun.yml --limit 10 \
  --json createdAt,conclusion,displayTitle \
  --template '{{range .}}{{.createdAt}} {{.conclusion}}{{"\t"}}{{.displayTitle}}{{"\n"}}{{end}}'
```

## 2. When it fails: read the Cloud Build log, not the GitHub log

**This is the step whose absence hid the outage.** On a build failure the
GitHub log says only:

```
Building Container ... failed
ERROR: (gcloud.run.deploy) Build failed; check build logs for details
```

The compiler error is in Cloud Build, in GCP. **Builds are regional** — the
`gcloud builds` default is `global`, where this project has none, so a missing
`--region` returns an empty list and the confusing error
`could not parse resource []`:

```bash
# Wrong — silently empty:
gcloud builds list --limit 1

# Right:
gcloud builds list --region="$REGION" --limit 5 \
  --format='table(id, status, createTime)'

gcloud builds log --region="$REGION" \
  "$(gcloud builds list --region="$REGION" --limit 1 --format='value(id)')" \
  2>&1 | tail -40
```

## 3. Confirm the new binary is actually serving

A green job is not proof. Check both of these.

### 3a. A new revision took traffic

```bash
gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.latestReadyRevisionName, status.traffic[0].revisionName)'
```

Both values should be the same, and the number should have gone **up**
(`...-00055-...` after `...-00054-...`). An unchanged number means the deploy
did not land, however green the job looked.

### 3b. The running image contains your change

The OpenAPI spec is baked into the image (`COPY --from=builder /app/api ./api`),
so what the API serves at `/api/specs/openapi.yaml` is an exact fingerprint of
the binary that is running. Grep it for something your change added:

```bash
curl -s "$API/api/specs/openapi.yaml" | grep -c '^  /transactions:'   # 1 = live
```

### Two traps in this check

**Never verify with a status code on an API route.** Unauthenticated requests
get `401` from the auth gate, which runs *before* routing — so a route that
does not exist answers `401`, not `404`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/transactions"   # 401 either way — proves nothing
```

**Use the root spec, not a nested one.** Only the files listed in
`internal/httpserver/server.go` are registered; the per-domain file
`specs/transactions/transactions.yaml` is **not** among them, so it answers
`401` (unmatched route → the gate sees an empty `c.Path()` → not recognised as
public). `grep -c` against that error JSON returns `0` and reads as "not
deployed" even when the deploy succeeded. Known gap, see §6.

## 4. Frontend (Cloudflare Pages)

```bash
gh run list --limit 5 --json conclusion,displayTitle,workflowName \
  --template '{{range .}}{{.workflowName}} {{.conclusion}} {{.displayTitle}}{{"\n"}}{{end}}'
```

Pages also reports as a check on the PR. Then hard-reload the app (⇧⌘R) — a
stale service-worker/CDN copy is the usual reason a shipped change appears
missing.

## 5. The end-to-end check

Sign in and exercise the feature. For the transactions view: the dashboard's
**Transactions** pill loads rows rather than an error. Nothing above
substitutes for this.

## 6. Known gaps

* **No post-deploy verification in CI.** `deploy-cloudrun.yml` can report
  success while serving a stale or broken revision; §3 is manual because
  nothing automates it. A smoke-check step that fails the job when §3b returns
  `0` would close this.
* **Cloud Build failures are invisible from GitHub.** Surfacing the build log
  in the workflow on failure would have cut the outage from three weeks to one
  run.
* **No CI image build.** `lint.yml` runs Go on the runner, where
  `GOTOOLCHAIN=auto` silently downloads whatever `go.mod` asks for. The
  `golang` images pin `GOTOOLCHAIN=local` and refuse, so a `go` directive bump
  passes every PR check and only breaks in Cloud Build, post-merge. A
  `docker build` of `backend/Dockerfile` in the PR checks catches it at review
  time.
* **`specs/transactions/transactions.yaml` is not served** (§3b). It has been
  missing from the list in `server.go` since the file was added on 2026-06-21,
  so a tool loading the live spec cannot follow that `$ref`. The comment above
  that list says adding a sibling spec file needs no edit here, which is true
  of the auth gate but not of the registration.

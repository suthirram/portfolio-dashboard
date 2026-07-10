# PD-029: Cloud Run backend deploy runbook

Step-by-step to host the Go API on Google Cloud Run. Decision + rationale:
[ADR-0002](../adrs/ADR-0002-backend-cloud-run.md). Frontend (Cloudflare Pages)
and database (MongoDB Atlas) are unchanged from
[PD-012](PD-012-cloudflare-flyio-deploy.md).

At ~5–10 family users this runs inside Cloud Run's monthly free tier — **$0**.

## 0. Prerequisites

* `gcloud` CLI installed and logged in: `gcloud auth login` `brew install --cask gcloud-cli`

* A GCP project (free to create). Note its **project ID**.
* A MongoDB Atlas M0 cluster + connection string (`MONGODB_URI`).
* Optional — gold tracking (PRD-003 / DD-003): a Postgres database +
  connection string (`POSTGRES_URI`), e.g. a Neon free-tier branch. Without
  it the backend boots normally with gold features disabled (`/api/gold/*`
  answers 503).
* The frontend origin, e.g. `https://portfolio-dashboard.pages.dev`.

```bash
export PROJECT_ID=your-project-id
export REGION=europe-west1        # asia-south1 (Mumbai) if the family is in India
gcloud config set project "$PROJECT_ID"
```

## 1. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com
```

## 2. Store the connection URIs in Secret Manager

The URIs are the only secrets; everything else is non-sensitive config.

```bash
printf '%s' 'mongodb+srv://USER:PASS@cluster.mongodb.net/portfolio' \
  | gcloud secrets create MONGODB_URI --data-file=-

# Optional — gold tracking. Both the CI workflow and deploy.sh probe for
# this secret and attach it only when it exists; skip this step to deploy
# without gold storage.
printf '%s' 'postgres://USER:PASS@HOST/portfolio?sslmode=require' \
  | gcloud secrets create POSTGRES_URI --data-file=-
```

To rotate later: `gcloud secrets versions add MONGODB_URI --data-file=-`
(same for `POSTGRES_URI`).

## 3. First deploy (manual)

This proves the setup before wiring CI. Run from the repo root:

```bash

GCP_PROJECT_ID="$PROJECT_ID" CORS_ALLOWED_ORIGINS="https://portfolio-dashboard-50e.pages.dev" ./deploy/cloudrun/deploy.sh

```

Cloud Build builds `backend/Dockerfile`, pushes to Artifact Registry, and
deploys. The script prints the service URL
(`https://portfolio-dashboard-api-xxxx.<region>.run.app`).

Grant the Cloud Run runtime service account read access to the secret if the
first deploy reports a permissions error:

```bash
PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding MONGODB_URI \
  --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
# repeat for POSTGRES_URI if you created it
```

Smoke test:

```bash

curl -fsS "$(gcloud run services describe portfolio-dashboard-api \
  --region "$REGION" --format='value(status.url)')/api/healthz"

```

## 4. Point the frontend at it

The frontend calls the API **same-origin** at `/api`. The Pages Function
[`frontend/functions/api/[[path]].ts`](../../frontend/functions/api/%5B%5Bpath%5D%5D.ts)
reverse-proxies `/api/*` to Cloud Run, so the session cookie is stored
first-party. This is required: a cross-origin API makes the cookie third-party,
which iOS Safari/Chrome block — the app then looks logged in (from the in-memory
login response) but every later request 401s with "not logged in". Desktop
Chrome still allows the third-party cookie, so the bug only shows on iPad/iPhone.

In Cloudflare Pages → project → Settings → Environment variables:

* Set `API_ORIGIN` to the Cloud Run URL (no trailing slash, no `/api` suffix).
* Leave `VITE_API_URL` **unset** — setting it sends the browser cross-origin and
  reintroduces the third-party-cookie bug.

Redeploy the frontend. `CORS_ALLOWED_ORIGINS` (step 3) is no longer used by the
browser path (the Pages Function calls Cloud Run server-to-server), but keep it
matching the Pages origin so direct/curl access and any non-proxied client still
pass credentialed CORS.

## 5. Keyless CI/CD (Workload Identity Federation)

So `git push` to `main` auto-deploys, with no JSON key in the repo.

### 5a. Service account for deploys

```bash

gcloud iam service-accounts create gh-deploy \
  --display-name="GitHub Actions Cloud Run deploy"


DEPLOY_SA="gh-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/storage.admin \
  roles/iam.serviceAccountUser \
  roles/secretmanager.secretAccessor ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}" --role="$ROLE"
done
```

### 5b. Workload Identity pool + GitHub provider

```bash
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub"

POOL_ID=$(gcloud iam workload-identity-pools describe github \
  --location=global --format='value(name)')

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='suthirram/portfolio-dashboard'"

# Let only this repo impersonate the deploy SA
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/suthirram/portfolio-dashboard"

# The provider resource name for the GitHub secret below
gcloud iam workload-identity-pools providers describe github \
  --location=global --workload-identity-pool=github \
  --format='value(name)'
```

### 5c. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | your project ID |
| `GCP_WIF_PROVIDER` | provider resource name from 5b (`projects/.../providers/github`) |
| `GCP_DEPLOY_SA` | `gh-deploy@<project-id>.iam.gserviceaccount.com` |
| `CORS_ALLOWED_ORIGINS` | the Pages origin, e.g. `https://portfolio-dashboard.pages.dev` |

After this, pushes to `main` touching `backend/**` deploy automatically via
[`.github/workflows/deploy-cloudrun.yml`](../../.github/workflows/deploy-cloudrun.yml).
Trigger manually any time with **Actions → Deploy backend to Cloud Run → Run
workflow**.

## Tuning

* **Region** — `europe-west1` default; use `asia-south1` (Mumbai) for India.
  Keep Cloud Run and Atlas in the same region for lowest latency.
* **Kill the cold start** — `--min-instances 1` (leaves the free tier; ~a few
  $/mo). No code change.
* **Memory** — `512Mi` default; drop to `256Mi` to match the old Fly sizing, or
  raise if you see OOM in logs.
* **Cost guard** — `--max-instances 4` caps a runaway-traffic bill.

# First run & operations

On a brand-new database the backend creates a single super admin
`admin` / `admin` with `must_change_password` set. Log in and complete the
forced onboarding (real password + three security questions) before anything
else works.

```bash
cd backend

# Assign any pre-auth holdings to an owner (run once after upgrading):
go run . migrate users --owner admin

# Seed an `opening` ledger event for every existing holding so its position
# becomes a projection of the new transactions ledger (idempotent):
go run . migrate transactions

# Copy the super admin's holdings into another database (e.g. local → prod):
MONGODB_URI='mongodb://localhost:27017/portfolio' \
  go run . migrate copy-holdings --to-uri '<dest-uri>' --to-db portfolio

# Break-glass for a locked-out super admin (no login; needs MONGODB_URI):
go run . admin reset-lockout --username admin
PD_NEW_PASSWORD='a-strong-password' go run . admin set-password --username admin
```

## Daily snapshot job

The history is fed by the `snapshot` subcommand, invoked by an external cron
(Cloud Run Job `pd-snapshot` in production). It runs the **same binary/image**
as the API, so a deploy that updates the API also repoints the job.

```bash
# Snapshot the current IST trading day for every active user:
go run . snapshot

# Re-run a specific day (idempotent; preserves manual overrides):
go run . snapshot --date 2026-06-24
```

## OTel tracing — enabling on Cloud Run (Grafana Cloud)

Tracing is off by default. The deploy workflow gates on two GCP secrets; create
them once and every subsequent deploy picks them up automatically.

### 1. Get values from Grafana Cloud

In the Grafana Cloud UI: **My Account → Stack → OpenTelemetry (OTLP)**. Note:

* Gateway endpoint: `https://otlp-gateway-<region>.grafana.net/otlp`
* Instance ID (numeric)
* API token (MetricsPublisher scope)

### 2. Create the GCP secrets

```bash
INSTANCE_ID=1727329
TOKEN= 323=

echo -n "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp" | \
  gcloud secrets create OTEL_EXPORTER_OTLP_ENDPOINT \
    --project="$GCP_PROJECT_ID" \
    --data-file=-

echo -n "Authorization=Basic $(echo -n "${INSTANCE_ID}:${TOKEN}" | base64)" | \
  gcloud secrets create OTEL_EXPORTER_OTLP_HEADERS \
    --project="$GCP_PROJECT_ID" \
    --data-file=-
```

### 3. Grant Cloud Run runtime SA access

The default Compute SA is `<project-number>-compute@developer.gserviceaccount.com`.
Repeat for each new secret (same pattern used for MONGODB_URI / POSTGRES_URI):

```bash
PROJECT_NUM=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')
SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"

for SECRET in OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project="$GCP_PROJECT_ID" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4. Trigger deploy

```bash
gh workflow run deploy-cloudrun.yml
```

The CI gate (`deploy-cloudrun.yml` lines 60–67) detects both secrets → mounts
them as env vars + sets `OTEL_SERVICE_NAME=portfolio-api`. If either secret is
absent the deploy still succeeds with tracing disabled.

### 5. Verify

```bash
SVC_URL=$(gcloud run services describe portfolio-dashboard-api \
  --region europe-west1 --format='value(status.url)')

# Confirm env vars are in the revision
gcloud run services describe portfolio-dashboard-api \
  --region europe-west1 \
  --format='yaml(spec.template.spec.containers[0].env)'

# Fire a request, then check Grafana Cloud → Explore → Tempo → service = portfolio-api
curl -fsS "${SVC_URL}/api/healthz"
```

### Disabling tracing

Delete (or rename) the secrets — next deploy reverts to tracing-off:

```bash
gcloud secrets delete OTEL_EXPORTER_OTLP_ENDPOINT --project="$GCP_PROJECT_ID"
gcloud secrets delete OTEL_EXPORTER_OTLP_HEADERS  --project="$GCP_PROJECT_ID"
gh workflow run deploy-cloudrun.yml
```

```bash
for SECRET in OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS;
do 
  gcloud secrets add-iam-policy-binding "$SECRET"  --project="portfolio-dashboard-suthir" --member="serviceAccount:${DEPLOY_SA}"  --role="roles/secretmanager.secretAccessor"                                                                                                       
done 
```

```bash
 for SECRET in OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS; do                                                                              
  gcloud secrets add-iam-policy-binding "$SECRET" --project="portfolio-dashboard-suthir" --member="serviceAccount:gh-deploy@portfolio-dashboard-suthir.iam.gserviceaccount.com"  --role="roles/secretmanager.viewer"                                                                                                               
  done    
```

SVC_URL=$(gcloud run services describe portfolio-dashboard-api --region europe-west1 --format='value(status.url)')
curl -fsS "${SVC_URL}/api/healthz"

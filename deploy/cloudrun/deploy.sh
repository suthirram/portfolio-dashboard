#!/usr/bin/env bash
# Manual Cloud Run deploy — mirrors .github/workflows/deploy-cloudrun.yml for
# local use (first deploy, or when CI is unavailable). Run from the repo root.
#
# Prereqs (one-time): see docs/plans/PD-029-cloud-run-deploy.md
#   - gcloud CLI installed and `gcloud auth login` done
#   - GCP project with Cloud Run + Cloud Build + Artifact Registry + Secret
#     Manager APIs enabled
#   - Secret `MONGODB_URI` created in Secret Manager
#
# Usage:
#   GCP_PROJECT_ID=my-proj \
#   CORS_ALLOWED_ORIGINS=https://portfolio-dashboard.pages.dev \
#   ./deploy/cloudrun/deploy.sh

set -euo pipefail

SERVICE="${SERVICE:-portfolio-dashboard-api}"
REGION="${REGION:-europe-west1}"
PROJECT_ID="${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
CORS="${CORS_ALLOWED_ORIGINS:?set CORS_ALLOWED_ORIGINS (the frontend origin, e.g. https://<app>.pages.dev)}"

echo ">> Deploying ${SERVICE} to ${REGION} in project ${PROJECT_ID}"

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --source backend \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 4 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --set-env-vars "^##^LOG_FORMAT=json##LOG_LEVEL=debug##COOKIE_SECURE=true##MONGODB_DATABASE=portfolio##CORS_ALLOWED_ORIGINS=${CORS}" \
  --set-secrets "MONGODB_URI=MONGODB_URI:latest"

# Repoint the daily-snapshot cron (pd-snapshot) to the image just deployed.
# It runs the same binary as the service but is a separate Cloud Run Job, so it
# would otherwise stay pinned to a stale image. Skipped if the job doesn't exist
# yet (bootstrap it first with infra/gcp/snapshot-job.sh).
SNAPSHOT_JOB="${SNAPSHOT_JOB:-pd-snapshot}"
if gcloud run jobs describe "${SNAPSHOT_JOB}" --project "${PROJECT_ID}" \
    --region "${REGION}" >/dev/null 2>&1; then
  IMAGE=$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" \
    --region "${REGION}" --format 'value(spec.template.spec.containers[0].image)')
  echo ">> Repointing ${SNAPSHOT_JOB} to ${IMAGE}"
  gcloud run jobs update "${SNAPSHOT_JOB}" --project "${PROJECT_ID}" \
    --region "${REGION}" --image "${IMAGE}"
else
  echo ">> Skipping ${SNAPSHOT_JOB} update — job not found (run infra/gcp/snapshot-job.sh first)"
fi

echo ">> Service URL:"
gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" \
  --region "${REGION}" --format 'value(status.url)'

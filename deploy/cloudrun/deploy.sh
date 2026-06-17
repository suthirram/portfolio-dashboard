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

echo ">> Service URL:"
gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" \
  --region "${REGION}" --format 'value(status.url)'

#!/usr/bin/env bash
# Bootstraps the daily portfolio-snapshot cron on Google Cloud (PD-042).
#
# Idempotent: re-running it updates the Cloud Run Job + Cloud Scheduler
# job in place if they already exist, otherwise creates them.
#
# Required env (export before running, or pass on the command line):
#   PROJECT_ID         — GCP project hosting the deployment
#   REGION             — Cloud Run region (e.g. europe-west1, asia-south1)
#   IMAGE              — full container image ref, e.g.
#                        europe-west1-docker.pkg.dev/PROJECT/pd/backend:TAG
#                        Use the same image the web service runs — the
#                        snapshot subcommand is part of the same binary.
#   RUNNER_SA          — service-account email Cloud Scheduler uses to
#                        invoke the Cloud Run Job. Must have the
#                        roles/run.invoker on pd-snapshot.
#   MONGO_SECRET_NAME  — Secret Manager secret name holding MONGODB_URI
#                        (defaults to "mongodb-uri").
#
# Optional env:
#   JOB_NAME           — Cloud Run Job name (default "pd-snapshot")
#   SCHED_NAME         — Cloud Scheduler job name (default "pd-snapshot-daily")
#   SCHEDULE           — cron expression (default "0 0 * * *" — 00:00 UTC)
#   TZ_NAME            — scheduler timezone (default "Etc/UTC")
#   TASK_TIMEOUT       — single-task timeout (default "10m")
#   LOG_FORMAT         — JSON or text (default "json")
#   MONGO_DB           — database name (default "portfolio")

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID required}"
: "${REGION:?REGION required}"
: "${IMAGE:?IMAGE required}"
: "${RUNNER_SA:?RUNNER_SA required}"
MONGO_SECRET_NAME="${MONGO_SECRET_NAME:-mongodb-uri}"
JOB_NAME="${JOB_NAME:-pd-snapshot}"
SCHED_NAME="${SCHED_NAME:-pd-snapshot-daily}"
SCHEDULE="${SCHEDULE:-0 0 * * *}"
TZ_NAME="${TZ_NAME:-Etc/UTC}"
TASK_TIMEOUT="${TASK_TIMEOUT:-10m}"
LOG_FORMAT="${LOG_FORMAT:-json}"
MONGO_DB="${MONGO_DB:-portfolio}"

echo "▶ project=$PROJECT_ID region=$REGION image=$IMAGE"
gcloud config set project "$PROJECT_ID" >/dev/null

# 1. Cloud Run Job — the actual `backend snapshot` invocation.
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ updating existing Cloud Run Job $JOB_NAME"
  gcloud run jobs update "$JOB_NAME" \
    --image="$IMAGE" \
    --region="$REGION" \
    --task-timeout="$TASK_TIMEOUT" \
    --command=/app/portfolio-api \
    --args=snapshot \
    --set-env-vars="LOG_FORMAT=$LOG_FORMAT,MONGODB_DATABASE=$MONGO_DB" \
    --set-secrets="MONGODB_URI=$MONGO_SECRET_NAME:latest"
else
  echo "▶ creating Cloud Run Job $JOB_NAME"
  gcloud run jobs create "$JOB_NAME" \
    --image="$IMAGE" \
    --region="$REGION" \
    --task-timeout="$TASK_TIMEOUT" \
    --command=/app/portfolio-api \
    --args=snapshot \
    --set-env-vars="LOG_FORMAT=$LOG_FORMAT,MONGODB_DATABASE=$MONGO_DB" \
    --set-secrets="MONGODB_URI=$MONGO_SECRET_NAME:latest"
fi

# 2. Grant the scheduler SA permission to invoke the job (idempotent).
echo "▶ binding roles/run.invoker on $JOB_NAME to $RUNNER_SA"
gcloud run jobs add-iam-policy-binding "$JOB_NAME" \
  --region="$REGION" \
  --member="serviceAccount:$RUNNER_SA" \
  --role="roles/run.invoker" >/dev/null

# 3. Cloud Scheduler job — fires the Cloud Run Job at midnight UTC.
URI="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/$JOB_NAME:run"
if gcloud scheduler jobs describe "$SCHED_NAME" --location="$REGION" >/dev/null 2>&1; then
  echo "▶ updating existing Cloud Scheduler job $SCHED_NAME"
  gcloud scheduler jobs update http "$SCHED_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="$TZ_NAME" \
    --uri="$URI" \
    --http-method=POST \
    --oauth-service-account-email="$RUNNER_SA"
else
  echo "▶ creating Cloud Scheduler job $SCHED_NAME"
  gcloud scheduler jobs create http "$SCHED_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="$TZ_NAME" \
    --uri="$URI" \
    --http-method=POST \
    --oauth-service-account-email="$RUNNER_SA"
fi

echo "✓ done. Smoke-test once with: gcloud run jobs execute $JOB_NAME --region=$REGION --wait"

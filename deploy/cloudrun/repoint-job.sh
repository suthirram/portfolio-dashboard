#!/usr/bin/env bash
# Pins a Cloud Run Job to the image a Cloud Run service is running, so the
# job and the web app always run identical code. Exits 3 when the job does
# not exist, so a caller can skip a job that has not been created yet.
#
# Usage: repoint-job.sh <service> <job> <region>
# The project comes from gcloud config or CLOUDSDK_CORE_PROJECT.

set -euo pipefail

SERVICE="$1"
JOB="$2"
REGION="$3"

if ! gcloud run jobs describe "${JOB}" --region "${REGION}" >/dev/null 2>&1; then
  echo ">> Job ${JOB} not found in ${REGION}"
  exit 3
fi
IMAGE=$(gcloud run services describe "${SERVICE}" --region "${REGION}" \
  --format 'value(spec.template.spec.containers[0].image)')
echo ">> Repointing ${JOB} to ${IMAGE}"
gcloud run jobs update "${JOB}" --region "${REGION}" --image "${IMAGE}"

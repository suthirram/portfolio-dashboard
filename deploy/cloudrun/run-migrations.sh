#!/usr/bin/env bash
# Runs pending data migrations after a deploy (DD-014 §7): pins the migrate
# job to the service's freshly deployed image, executes it and waits.
#
# A failed migration step is recorded `failed` in the migrations collection
# and the next run resumes it, so a failed execution warns instead of failing
# the deploy (owner decision, 2026-11-16). Skips when the job does not exist
# yet; create it as described in docs/operations.md.
#
# Usage: run-migrations.sh <service> <job> <region>
# The project comes from gcloud config or CLOUDSDK_CORE_PROJECT.

set -euo pipefail

SERVICE="$1"
JOB="$2"
REGION="$3"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STATUS=0
"${HERE}/repoint-job.sh" "${SERVICE}" "${JOB}" "${REGION}" || STATUS=$?
if (( STATUS == 3 )); then
  echo ">> Skipping migrations — job ${JOB} does not exist yet (see docs/operations.md)"
  exit 0
fi
(( STATUS == 0 )) || exit "${STATUS}"

if gcloud run jobs execute "${JOB}" --region "${REGION}" --wait; then
  echo ">> Migrations finished"
else
  echo "::warning title=Migrations::Job ${JOB} failed; its step status is in the migrations collection and the next deploy resumes it"
fi

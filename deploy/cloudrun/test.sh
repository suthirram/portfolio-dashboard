#!/usr/bin/env bash
# Self-tests for repoint-job.sh and run-migrations.sh against a fake gcloud
# on PATH: no network, no GCP project. Run: bash deploy/cloudrun/test.sh

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The fake records every call and answers per FAKE_* switches.
cat > "$tmp/gcloud" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$GCLOUD_LOG"
case "$*" in
  "run jobs describe"*)     [[ "${FAKE_JOB_EXISTS:-1}" == 1 ]] ;;
  "run services describe"*) echo "registry/app@sha256:new" ;;
  "run jobs update"*)       [[ "${FAKE_UPDATE_FAILS:-0}" == 0 ]] ;;
  "run jobs execute"*)      [[ "${FAKE_EXECUTE_FAILS:-0}" == 0 ]] ;;
esac
FAKE
chmod +x "$tmp/gcloud"
export PATH="$tmp:$PATH" GCLOUD_LOG="$tmp/calls"

pass=0
fail=0
check() { # check <name> <command…>: passes when the command succeeds
  local name="$1"
  shift
  if "$@"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL: $name"
    echo "  output: $output"
    echo "  calls:  $(tr '\n' '|' < "$GCLOUD_LOG")"
  fi
}
migrate() { # runs run-migrations.sh, capturing output and exit code
  : > "$GCLOUD_LOG"
  output="$("$here/run-migrations.sh" svc migrate-job europe-west1 2>&1)"
  code=$?
}
called() { grep -q -- "$1" "$GCLOUD_LOG"; }
not_called() { ! called "$1"; }

migrate
check "existing job exits 0" test "$code" -eq 0
check "job is pinned to the service image" called "run jobs update migrate-job --region europe-west1 --image registry/app@sha256:new"
check "job runs and waits" called "run jobs execute migrate-job --region europe-west1 --wait"
check "image is pinned before the run" test "$(grep -n 'jobs update' "$GCLOUD_LOG" | cut -d: -f1)" -lt "$(grep -n 'jobs execute' "$GCLOUD_LOG" | cut -d: -f1)"

FAKE_JOB_EXISTS=0 migrate
check "missing job exits 0" test "$code" -eq 0
check "missing job says it skipped" grep -q "Skipping migrations" <<< "$output"
check "missing job is never updated" not_called "run jobs update"
check "missing job is never executed" not_called "run jobs execute"

FAKE_EXECUTE_FAILS=1 migrate
check "failed migration does not fail the deploy" test "$code" -eq 0
check "failed migration emits a workflow warning" grep -q "::warning title=Migrations::" <<< "$output"

FAKE_UPDATE_FAILS=1 migrate
check "failed repoint fails the deploy" test "$code" -ne 0
check "failed repoint never runs a stale image" not_called "run jobs execute"

: > "$GCLOUD_LOG"
FAKE_JOB_EXISTS=0 "$here/repoint-job.sh" svc snapshot-job europe-west1 >/dev/null 2>&1
code=$?
output=""
check "repoint-job exits 3 for a missing job" test "$code" -eq 3

echo "deploy script tests: $pass passed, $fail failed"
(( fail == 0 ))

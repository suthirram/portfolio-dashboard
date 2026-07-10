# GCP infra — production cron for PD-042

The `/api/history` feature needs a daily 00:00 UTC tick that invokes
`backend snapshot` once. In production the runtime is **Cloud Run +
Cloud Scheduler** (see [PD-029](../../docs/plans/PD-029-cloud-run-deploy.md)
for the web-service deploy this builds on).

`snapshot-job.sh` is an **idempotent** bootstrap script that creates
or updates two resources:

| Resource | What it is |
|---|---|
| `pd-snapshot` | Cloud Run **Job** (not Service). Runs `backend snapshot` once per invocation. Reads the same `MONGODB_URI` secret the web service does. |
| `pd-snapshot-daily` | Cloud Scheduler HTTP job. Fires at `0 0 * * * Etc/UTC` and POSTs to the Cloud Run Job's `:run` endpoint. |

The script is safe to re-run on every deploy — it patches in place
rather than failing on duplicates.

The job is deliberately **Mongo-only** — no `POSTGRES_URI`. Gold data
(PRD-003 / DD-003) lives in Postgres and is not snapshotted: the History
page's gold overlay is computed as-of each row date at read time from the
gold ledger + price series. Only the web service needs the Postgres secret
(see [PD-029](../../docs/plans/PD-029-cloud-run-deploy.md) §2).

## Prerequisites

1. PD-029 finished — Cloud Run web service, Artifact Registry repo,
   `mongodb-uri` Secret Manager secret are all already provisioned.
2. A service account that Cloud Scheduler can authenticate as:

   ```bash
   export RUNNER_SA="pd-scheduler-runner@$PROJECT_ID.iam.gserviceaccount.com"
   gcloud iam service-accounts create pd-scheduler-runner --display-name="PD scheduler runner"
   # The script binds roles/run.invoker on the snapshot job itself; no
   # extra project-level role is required.
   ```

3. `gcloud` CLI installed and authenticated against `PROJECT_ID`.
4. `cloudscheduler.googleapis.com` API enabled:

   ```bash
   gcloud services enable cloudscheduler.googleapis.com
   ```

## Run

```bash
export PROJECT_ID="your-project"
export REGION="europe-west1"
export IMAGE="europe-west1-docker.pkg.dev/$PROJECT_ID/pd/backend:$(git rev-parse --short HEAD)"
export RUNNER_SA="pd-scheduler-runner@$PROJECT_ID.iam.gserviceaccount.com"

./infra/gcp/snapshot-job.sh
```

Smoke-test the job by invoking it manually:

```bash
gcloud run jobs execute pd-snapshot --region="$REGION" --wait
```

Tail the logs:

```bash
gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=pd-snapshot' \
  --limit=50 --format='value(textPayload)'
```

## Env vars accepted by the script

| Var | Required | Default | Purpose |
|---|---|---|---|
| `PROJECT_ID` | yes | — | GCP project hosting the deploy |
| `REGION` | yes | — | Cloud Run region |
| `IMAGE` | yes | — | Container image — **use the same one the web service runs** |
| `RUNNER_SA` | yes | — | Service account email Cloud Scheduler invokes as |
| `MONGO_SECRET_NAME` | no | `mongodb-uri` | Secret Manager secret holding `MONGODB_URI` |
| `JOB_NAME` | no | `pd-snapshot` | Cloud Run Job name |
| `SCHED_NAME` | no | `pd-snapshot-daily` | Cloud Scheduler job name |
| `SCHEDULE` | no | `0 0 * * *` | Cron expression |
| `TZ_NAME` | no | `Etc/UTC` | Scheduler timezone |
| `TASK_TIMEOUT` | no | `10m` | Single-task timeout |
| `LOG_FORMAT` | no | `json` | Passed through as `LOG_FORMAT` env var |
| `MONGO_DB` | no | `portfolio` | Passed through as `MONGODB_DATABASE` |

## Roll back

```bash
gcloud scheduler jobs delete pd-snapshot-daily --location="$REGION"
gcloud run jobs delete pd-snapshot --region="$REGION"
```

The `portfolio_snapshots` Mongo collection survives unchanged — the
historical UI continues to read whatever rows already exist.

## Wiring into CI

If you want the script to run on every backend deploy, add it after
the Cloud Run service deploy step in your CI workflow:

```yaml
- name: Configure snapshot cron
  env:
    PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
    REGION: europe-west1
    IMAGE: ${{ env.IMAGE_REF }}
    RUNNER_SA: pd-scheduler-runner@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com
  run: ./infra/gcp/snapshot-job.sh
```

Because the script is idempotent, running it on every deploy keeps
the job pinned to the freshly-deployed image — no separate "promote"
step is needed.

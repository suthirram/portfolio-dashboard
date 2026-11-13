# PD-047: Terraform for GCP infra (scoping)

* **Status**: Decided — scope locked, see [DD-004](../designs/DD-004-terraform-gcp-infra.md) for the technical design
* **Owner**: project owner
* **Builds on**: [PD-029 Cloud Run deploy](PD-029-cloud-run-deploy.md), [ADR-0002](../adrs/ADR-0002-backend-cloud-run.md), [infra/gcp/README.md](../../infra/gcp/README.md)

## 1. Goal

Replace the current ad-hoc `gcloud` scripts with Terraform so GCP infra has
one declarative source of truth, `terraform plan` shows drift/diffs before
they land, and provisioning a resource isn't a one-off shell incantation
someone has to remember to re-run.

This doc scopes the work and surfaces the open decisions. No infra changes
happen until the owner picks an answer to §5 and a DD-0xx design doc follows
(per this project's plan-before-big-task convention).

## 2. What exists today (imperative, no state file)

| Resource | Created by | Notes |
|---|---|---|
| Cloud Run **service** `portfolio-dashboard-api` | `gcloud run deploy --source backend` in `.github/workflows/deploy-cloudrun.yml` (and mirrored in `deploy/cloudrun/deploy.sh` for manual use) | **Builds from source every deploy** — Cloud Build compiles `backend/Dockerfile` and pushes to an auto-created Artifact Registry repo. No pinned image URI ever lives in code. |
| Cloud Run **job** `pd-snapshot` | `infra/gcp/snapshot-job.sh` (idempotent, patches in place) | Repointed to the freshly built image after every service deploy. |
| Cloud Scheduler job `pd-snapshot-daily` | same script | Cron trigger for the job above. |
| Secret Manager secrets (`MONGODB_URI`, `POSTGRES_URI`, `OTEL_EXPORTER_OTLP_*`) | manual `gcloud secrets create`, one-time (PD-029 §2, `plan.md`) | Values never touch git; wiring is conditional (`gcloud secrets describe` checks) in both deploy paths. |
| WIF pool + provider + deploy SA | manual, one-time (PD-029) | Keyless CI auth; SA scoped to `run.admin` + `iam.serviceAccountUser`, deliberately narrow (ADR-0002 "least privilege"). |
| `pd-scheduler-runner` SA | `infra/gcp/README.md` prereq step | Cloud Scheduler invokes the job as this identity; bound `roles/run.invoker` on the job only. |

Two near-duplicate deploy scripts (CI workflow + local `deploy.sh`) is itself
a small reuse smell Terraform would remove — one `terraform apply` replaces
both.

## 3. Why this is not a drop-in wrap

`gcloud run deploy --source` couples **build** and **deploy** into one
command. Terraform's `google_cloud_run_v2_service` resource takes a
pre-built **image URI** — it has no equivalent of `--source`. Moving to
Terraform means splitting the pipeline:

```
today:   git push → gcloud run deploy --source backend  (Cloud Build builds + deploys in one step)
after:   git push → docker build + push to Artifact Registry (CI step)
                  → terraform apply -var image=<new tag>  (deploy step)
```

That's a real architecture change to the deploy pipeline, not just an
infra-as-code skin over the existing commands.

## 4. Tension with existing decisions

* **Least privilege (ADR-0002).** The current deploy SA can only touch Cloud
  Run. A Terraform-managed stack that also owns Scheduler jobs, Secret
  Manager, IAM bindings, and Artifact Registry needs a much broader role set
  on that same SA — a compromised CI token would have a bigger blast radius.
  Worth deciding whether IAM/Scheduler stay hand-managed (documented, not in
  Terraform) even if Cloud Run itself moves in.
* **Cost-first (ADR-0001/0002, "$0/mo").** Terraform remote state needs a
  backend — normally a GCS bucket. Trivial cost, but it's a new always-on
  resource in a stack that has deliberately had none.
* **Secrets never in git/state.** Secret Manager *secret* resources (the
  container) are fine to manage in Terraform; secret **versions** (the
  values) must stay out — those still get set via `gcloud secrets versions
  add` or console, exactly as today, so a value never lands in a `.tfstate`
  file or plan output.

## 5. Decisions (owner, this session)

1. **Scope**: Cloud Run (service `portfolio-dashboard-api` + job
   `pd-snapshot`) and the Artifact Registry repo move into Terraform,
   imported from live config (not recreated). Cloud Scheduler and Secret
   Manager (containers and values) stay hand-managed as today. WIF
   pool/provider and the `gh-deploy`/`pd-scheduler-runner` service accounts
   stay hand-managed (low-churn identity setup, out of scope).
2. **Build/deploy split**: GitHub Actions builds and pushes the image
   (`docker build` + `docker push`); Terraform takes the resulting image URI
   as a variable. No Cloud Build trigger added.
3. **Cost**: accepted as a wash — a small GCS state bucket replaces nothing
   that costs money today, but doesn't meaningfully change the $0/mo picture
   at this traffic level.
4. **IAM**: `gh-deploy`'s project-wide `roles/storage.admin` (added for Cloud
   Build staging) is dropped once Cloud Build leaves the pipeline, replaced
   by a bucket-scoped `roles/storage.objectAdmin` on the new tfstate bucket
   only — a tightening, not just a lateral move.
5. **Import, not recreate**: every in-scope resource's live config was
   pulled via `gcloud ... describe` (see DD-004 §1) before writing any `.tf`,
   so the Terraform resource blocks match what's running today.

See [DD-004](../designs/DD-004-terraform-gcp-infra.md) for the full design:
exact resource names, file layout, `.tf` skeletons, the import commands, and
the CI workflow diff.

## 6. Next step

Write the implementation PD in the checkbox-per-step format (per this
project's plan-doc convention) from DD-004, then execute it — starting with
the state-bucket bootstrap and a zero-diff `terraform plan` after each
import, before any `apply` touches the live service or job.

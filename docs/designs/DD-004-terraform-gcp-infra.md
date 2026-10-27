# DD-004: Terraform for GCP infra — technical design

* **Status**: Draft (DD)
* **Scopes**: [PD-047](../plans/PD-047-terraform-gcp-infra.md)
* **Owner decisions (this session)**: manage Cloud Run (service + job) and
  Artifact Registry via Terraform. Cloud Scheduler and Secret Manager stay
  hand-managed as-is. Cost is accepted as a wash. Build moves into GitHub
  Actions (`docker build` + push), Terraform takes a pre-built image URI.

## 1. Scope (verified against the live project `portfolio-dashboard-suthir`)

| Resource | Live name | Terraform? |
|---|---|---|
| Artifact Registry repo | `cloud-run-source-deploy` (europe-west1, Docker) | **Yes** — import |
| Cloud Run service | `portfolio-dashboard-api` | **Yes** — import |
| Cloud Run job | `pd-snapshot` | **Yes** — import |
| Cloud Scheduler job | `pd-snapshot-daily` | No — stays in `infra/gcp/snapshot-job.sh` |
| Secrets | `MONGODB_URI`, `POSTGRES_URI`, `POSTGRES_URI_DEV`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | No — containers *and* values stay hand-managed (`gcloud secrets create/versions add`), per owner decision. Terraform only ever *references* secret names as strings in env config, never a `google_secret_manager_secret` resource. |
| WIF pool/provider (`github`), deploy SA (`gh-deploy`), scheduler SA (`pd-scheduler-runner`) | existing | No — one-time identity setup (PD-029), low churn, out of scope. Terraform reuses `gh-deploy` to authenticate (same WIF flow), does not manage it. |
| Cloud Run service `portfolio-dashboard-api-dev`, job `pd-migrate-txns` | existing | No — dev stack is PD-044's ephemeral label-triggered deploy (doesn't fit static Terraform); `pd-migrate-txns` is a one-off manual migration run, not part of the deploy pipeline. Leave both untouched. |

## 2. Build/deploy split

Today `gcloud run deploy --source backend` does Cloud-Build-build-and-deploy
in one step. New flow:

```
push to main (backend/** changed)
  → GH Actions: docker build backend -t IMAGE:GIT_SHA
  → docker push IMAGE:GIT_SHA   (to the existing cloud-run-source-deploy AR repo)
  → terraform apply -var="image=IMAGE:GIT_SHA"
      → updates google_cloud_run_v2_service.api (new revision)
      → updates google_cloud_run_v2_job.snapshot (repoints to same image)
```

One image tag drives both the service and the job in the same `apply` —
replaces the current separate "repoint snapshot job" step in
`deploy-cloudrun.yml`.

`cloudbuild.googleapis.com` / `roles/cloudbuild.builds.editor` on `gh-deploy`
become unused once this lands (Cloud Build is no longer in the deploy path)
— drop the role, don't leave stale permissions.

## 3. State backend

New GCS bucket, e.g. `portfolio-dashboard-suthir-tfstate` (must be
bootstrapped once, manually, outside Terraform — a backend can't create the
bucket it stores its own state in):

```bash
gcloud storage buckets create gs://portfolio-dashboard-suthir-tfstate \
  --project=portfolio-dashboard-suthir --location=europe-west1 \
  --uniform-bucket-level-access
gcloud storage buckets update gs://portfolio-dashboard-suthir-tfstate --versioning
```

`gh-deploy`'s existing project-wide `roles/storage.admin` (added in PD-029
for Cloud Build's object staging) is broader than Terraform state access
needs. **Tighten while touching this**: drop the project-wide role, grant
`roles/storage.objectAdmin` scoped to only the tfstate bucket:

```bash
gcloud storage buckets add-iam-policy-binding gs://portfolio-dashboard-suthir-tfstate \
  --member="serviceAccount:gh-deploy@portfolio-dashboard-suthir.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
gcloud projects remove-iam-policy-binding portfolio-dashboard-suthir \
  --member="serviceAccount:gh-deploy@portfolio-dashboard-suthir.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

## 4. File layout

```
infra/gcp/terraform/
  versions.tf     # required_providers (google ~> 6.x), required_version
  backend.tf      # backend "gcs" { bucket = "portfolio-dashboard-suthir-tfstate", prefix = "prod" }
  variables.tf    # project_id, region, image (no default — always passed by CI)
  main.tf         # google_artifact_registry_repository.images (import),
                  # google_cloud_run_v2_service.api (import),
                  # google_cloud_run_v2_job.snapshot (import)
  outputs.tf      # service_url
```

`main.tf` skeleton (env vars/secrets mirror the current
`deploy-cloudrun.yml`/`deploy.sh` flags exactly — no behavior change, just a
declarative equivalent):

```hcl
resource "google_artifact_registry_repository" "images" {
  repository_id = "cloud-run-source-deploy"
  location      = var.region
  format        = "DOCKER"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "portfolio-dashboard-api"
  location = var.region
  template {
    containers {
      image = var.image
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
      env { name = "LOG_FORMAT" value = "json" }
      env { name = "LOG_LEVEL" value = "info" }
      env { name = "COOKIE_SECURE" value = "true" }
      env { name = "MONGODB_DATABASE" value = "portfolio" }
      env { name = "CORS_ALLOWED_ORIGINS" value = var.cors_allowed_origins }
      env {
        name = "MONGODB_URI"
        value_source { secret_key_ref { secret = "MONGODB_URI" version = "latest" } }
      }
      # POSTGRES_URI / OTEL_* env blocks: same value_source pattern, kept
      # conditional via `dynamic "env"` blocks gated on a `count`-style
      # variable — mirrors the existing `gcloud secrets describe` probes in
      # deploy-cloudrun.yml so an absent secret still means "feature disabled"
      # rather than a failed apply.
    }
    scaling { max_instance_count = 4 }
  }
}

resource "google_cloud_run_v2_job" "snapshot" {
  name     = "pd-snapshot"
  location = var.region
  template {
    template {
      containers {
        image   = var.image
        command = ["/app/portfolio-api"]
        args    = ["snapshot"]
        resources { limits = { cpu = "1", memory = "512Mi" } }
        env { name = "LOG_FORMAT" value = "json" }
        env { name = "MONGODB_DATABASE" value = "portfolio" }
        env {
          name = "MONGODB_URI"
          value_source { secret_key_ref { secret = "MONGODB_URI" version = "latest" } }
        }
      }
    }
  }
}
```

The conditional-secret dynamic blocks (POSTGRES_URI, OTEL_*) are left as a
TODO marker for the implementation PD, not spelled out here — they need the
exact current `deploy-cloudrun.yml` probe logic translated to Terraform
conditionals (`var.postgres_secret_exists ? [...] : []`), which is
implementation, not design.

## 5. Import plan (no resources are recreated)

```bash
cd infra/gcp/terraform
terraform import google_artifact_registry_repository.images \
  projects/portfolio-dashboard-suthir/locations/europe-west1/repositories/cloud-run-source-deploy
terraform import google_cloud_run_v2_service.api \
  projects/portfolio-dashboard-suthir/locations/europe-west1/services/portfolio-dashboard-api
terraform import google_cloud_run_v2_job.snapshot \
  projects/portfolio-dashboard-suthir/locations/europe-west1/jobs/pd-snapshot
```

After each import: `terraform plan` **must show zero diff** before touching
anything else. A non-empty plan means the `.tf` resource doesn't yet match
live config — fix the `.tf`, don't let apply "correct" prod by surprise.

## 6. `infra/gcp/snapshot-job.sh` gets smaller

It currently creates/patches **both** the `pd-snapshot` job and the
`pd-snapshot-daily` scheduler. Once the job is Terraform-managed, trim the
script to only the Scheduler resource + the `pd-scheduler-runner` →
`roles/run.invoker` binding on the (now Terraform-created) job — it no
longer creates or repoints the job itself.

## 7. CI workflow diff (`deploy-cloudrun.yml`)

Replace the single `gcloud run deploy --source backend` step and the
separate "repoint snapshot job" step with:

```yaml
- name: Build and push image
  run: |
    IMAGE="europe-west1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/portfolio-dashboard-api:${{ github.sha }}"
    docker build -t "$IMAGE" backend
    docker push "$IMAGE"
    echo "IMAGE=$IMAGE" >> "$GITHUB_ENV"

- uses: hashicorp/setup-terraform@v3
- name: Terraform apply
  working-directory: infra/gcp/terraform
  run: |
    terraform init
    terraform apply -auto-approve -var="image=$IMAGE" -var="cors_allowed_origins=${{ secrets.CORS_ALLOWED_ORIGINS }}"
```

The conditional POSTGRES_URI/OTEL secret-probe logic currently inline in the
workflow moves into Terraform `-var` flags computed the same way (a `gcloud
secrets describe` check in a prior step, piped into `terraform apply -var`).

## 8. Not done here

This DD does not include: the exact `dynamic "env"` HCL for optional
secrets, the Terraform state bucket Terraform *itself* isn't allowed to
manage (bootstrap stays a manual one-time `gcloud storage buckets create`),
or a rollback runbook. Those belong in the implementation PD.

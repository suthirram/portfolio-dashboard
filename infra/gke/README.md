# GKE deploy (PD-050)

A second, parallel deployment target for the portfolio-dashboard backend +
frontend + snapshot cron on **Google Kubernetes Engine**. It does not replace the
Cloud Run deploy — both coexist so the migration is reversible (see
[teardown.sh](teardown.sh)).

| Concern | Cloud Run (today) | GKE (this) |
|---|---|---|
| API | Cloud Run service | `Deployment` backend + HPA |
| SPA | manual / static | `Deployment` frontend (nginx) |
| Snapshot cron | Cloud Run Job + Cloud Scheduler | native `CronJob` |
| Ingress / TLS | built-in | GCLB `Ingress` + `ManagedCertificate` |
| Secrets | `--set-secrets` | Secret Manager CSI + Workload Identity |
| Mongo | external (Atlas) | external (Atlas) — unchanged |

## One-time provision

```bash
export PROJECT_ID="your-project"
export REGION="europe-west1"
# CLUSTER_MODE=standard for node pools instead of Autopilot
./infra/gke/provision.sh
```

Then patch the placeholders and deploy:

```bash
gcloud container clusters get-credentials pd-gke --region "$REGION"
# In deploy/k8s/base: replace PROJECT_ID (serviceaccount.yaml, secretproviderclass.yaml),
# the domain (ingress.yaml), and CORS_ALLOWED_ORIGINS (configmap.yaml).
kubectl apply -k deploy/k8s/base
```

CI (`.github/workflows/deploy-gke.yml`, manual `workflow_dispatch`) builds/pushes
the images and applies the base on demand.

## Verify

```bash
kubectl -n portfolio get pods,svc,ingress,cronjob
kubectl -n portfolio describe managedcertificate pd-cert   # Active once DNS resolves
kubectl -n portfolio create job --from=cronjob/pd-snapshot snap-test   # smoke-test cron
```

## Tear down (stop paying)

```bash
export PROJECT_ID="your-project"
./infra/gke/teardown.sh
```

Full design notes and the Cloud-Run-to-GKE mapping: [PD-050](../../docs/plans/PD-050-gke-migration.md).

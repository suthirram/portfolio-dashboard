# PD-050 — Migrate the deploy to GKE (alongside Cloud Run)

## Goal

Stand up a **parallel** Google Kubernetes Engine deployment of the backend API,
the frontend SPA, and the daily snapshot cron, reusing the existing external
Mongo (Atlas) and the `MONGODB_URI` Secret Manager secret. This is a learning
exercise: the Cloud Run path (PD-029) stays fully intact, and the GKE side is
reversible via `infra/gke/teardown.sh`.

Non-goals: changing application code, moving Mongo into the cluster, deleting the
Cloud Run deploy, or multi-region.

## Topology

```
                 Internet
                    │
        ┌───────────▼────────────┐
        │  GCLB Ingress (gce)     │  static IP pd-ingress-ip
        │  ManagedCertificate TLS │  HTTP→HTTPS via FrontendConfig
        └─────┬─────────────┬─────┘
         /api │             │ /
        ┌─────▼─────┐   ┌────▼──────┐
        │ backend   │   │ frontend  │   (NEG, container-native LB)
        │ Deploy+HPA│   │ Deploy    │
        └─────┬─────┘   └───────────┘
              │ MONGODB_URI (env from synced Secret)
   ┌──────────▼───────────┐     ┌───────────────────────┐
   │ Secret Manager CSI   │     │ CronJob pd-snapshot    │
   │ (Workload Identity)  │     │ 00:00 UTC, same image  │
   └──────────┬───────────┘     └───────────┬───────────┘
              └────────── external MongoDB (Atlas) ───────┘
```

## Cloud Run → GKE mapping

| Cloud Run | GKE equivalent | Notes |
|---|---|---|
| Service `portfolio-dashboard-api` | `Deployment backend` + `Service` + `HPA` | min2/max4 mirrors min0/max4; min2 for rolling updates |
| `--allow-unauthenticated`, port 8080 | `Ingress` path `/api` → backend:80 → :8080 | NEG for container-native LB |
| `--set-env-vars` | `ConfigMap backend-config` (`envFrom`) | same keys |
| `--set-secrets MONGODB_URI` | `SecretProviderClass` + synced `Secret` (`secretKeyRef`) | Workload Identity, no keys in git |
| Cloud Run Job `pd-snapshot` | `CronJob pd-snapshot` | same image, `./portfolio-api snapshot` |
| Cloud Scheduler `pd-snapshot-daily` | `CronJob.spec.schedule` | one object instead of two |
| (frontend: manual) | `Deployment frontend` + nginx `ConfigMap` | SPA-only; Ingress routes `/api` |
| built-in TLS | `ManagedCertificate` + `FrontendConfig` | needs a domain → static IP |

## Key nuances (the learning bits)

* **Health checks.** GKE Ingress health-checks the Service; the default probes
  `/`. The backend serves JSON only, so a `BackendConfig` repoints its check to
  `/api/healthz` (the same public, DB-checking endpoint used for pod probes).
  The frontend keeps the default `/` (returns `index.html`, 200).
* **Container-native LB (NEG).** `cloud.google.com/neg: '{"ingress": true}'`
  makes the GCLB target pods directly, so LB health checks and the readiness gate
  line up. Without it, traffic hops through kube-proxy and node ports.
* **Secrets without keys.** The GKE Secret Manager add-on installs the CSI
  driver + provider. A `SecretProviderClass` (`provider: gke`) mounts the secret;
  `secretObjects` syncs it into a normal k8s `Secret` so the app reads it as the
  `MONGODB_URI` env var. The pod's ServiceAccount is bound to a GCP SA via
  Workload Identity (`iam.gke.io/gcp-service-account`), and that GCP SA holds
  `secretAccessor`. No exported JSON key anywhere.
* **TLS needs DNS.** A `ManagedCertificate` only goes `Active` once the domain's
  A record resolves to the reserved static IP — can take ~15–60 min. For pure
  learning without a domain, drop the cert + FrontendConfig and use plain HTTP at
  the IP (or `<ip>.nip.io`).
* **Autopilot vs Standard.** `provision.sh` defaults to Autopilot (no node-pool
  ops, per-pod billing — cheapest to spin up/tear down). `CLUSTER_MODE=standard`
  creates a small autoscaling node pool instead, which exposes node-level knobs
  if that is what you want to learn. The manifests are identical for both.

## Runbook

1. `./infra/gke/provision.sh` (APIs, cluster, Secret Manager add-on, Workload
   Identity SA + bindings, static IP).
2. Patch placeholders in `deploy/k8s/base`: `PROJECT_ID`, the domain, and
   `CORS_ALLOWED_ORIGINS`.
3. Point DNS A record at the printed static IP.
4. `kubectl apply -k deploy/k8s/base` (or run the manual `deploy-gke.yml`).
5. Verify: pods Ready, `ManagedCertificate` Active, smoke-test the CronJob.

## Rollback

`./infra/gke/teardown.sh` deletes the cluster, static IP, and Workload Identity
SA. Cloud Run, Artifact Registry, the `MONGODB_URI` secret, and the Atlas data
are untouched — traffic simply stays on (or returns to) Cloud Run.

## Open follow-ups (later PRs)

* Kustomize overlays (`dev`/`prod`) instead of in-place placeholder patching.
* `PodDisruptionBudget` + `NetworkPolicy` for the backend.
* Pin the `/healthz` Mongo timeout so a slow Atlas does not flap liveness.
* Decide the end state: cut Cloud Run over, or keep GKE as a learning sandbox.

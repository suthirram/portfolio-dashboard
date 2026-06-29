#!/usr/bin/env bash
# Provisions the GKE side of the portfolio-dashboard deploy (PD-050).
#
# Idempotent: every step is create-or-skip, safe to re-run. It does NOT deploy
# the app (that is `kubectl apply -k deploy/k8s/base`, run by CI or by hand) and
# it does NOT touch the existing Cloud Run deploy — the two can coexist.
#
# What it sets up:
#   1. Required GCP APIs.
#   2. A GKE cluster — Autopilot by default, Standard if CLUSTER_MODE=standard.
#   3. The Secret Manager add-on (CSI driver + provider) for SecretProviderClass.
#   4. A GCP service account (pd-gke-sa) + Workload Identity binding to the
#      in-cluster ServiceAccount portfolio/portfolio, and secretAccessor on the
#      MONGODB_URI secret.
#   5. A reserved global static IP for the Ingress.
#
# Reuses what PD-029 already created: Artifact Registry repo `pd`, the
# MONGODB_URI Secret Manager secret. Provision those first if starting fresh.
#
# Required env:
#   PROJECT_ID   — GCP project
# Optional env:
#   REGION       — default europe-west1 (matches Cloud Run)
#   CLUSTER_NAME — default pd-gke
#   CLUSTER_MODE — autopilot (default) | standard
#   MONGO_SECRET — Secret Manager secret name, default MONGODB_URI
#   GSA_NAME     — GCP service account id, default pd-gke-sa
#   KSA          — in-cluster ServiceAccount, default portfolio/portfolio
#   STATIC_IP    — reserved IP name, default pd-ingress-ip

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID required}"
REGION="${REGION:-europe-west1}"
CLUSTER_NAME="${CLUSTER_NAME:-pd-gke}"
CLUSTER_MODE="${CLUSTER_MODE:-autopilot}"
MONGO_SECRET="${MONGO_SECRET:-MONGODB_URI}"
GSA_NAME="${GSA_NAME:-pd-gke-sa}"
KSA="${KSA:-portfolio/portfolio}"
STATIC_IP="${STATIC_IP:-pd-ingress-ip}"
GSA_EMAIL="${GSA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KSA_NS="${KSA%%/*}"
KSA_NAME="${KSA##*/}"

echo "▶ project=$PROJECT_ID region=$REGION cluster=$CLUSTER_NAME mode=$CLUSTER_MODE"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "▶ enabling APIs"
gcloud services enable \
  container.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com >/dev/null

# 1. Cluster (create-or-skip). Autopilot ships the Secret Manager add-on and
#    Workload Identity on by default; Standard needs both flags.
if gcloud container clusters describe "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "▶ cluster $CLUSTER_NAME exists — skipping create"
elif [ "$CLUSTER_MODE" = "standard" ]; then
  echo "▶ creating STANDARD cluster $CLUSTER_NAME"
  gcloud container clusters create "$CLUSTER_NAME" \
    --region "$REGION" \
    --release-channel regular \
    --workload-pool "${PROJECT_ID}.svc.id.goog" \
    --addons GcpSecretManagerCsiDriver \
    --num-nodes 1 \
    --machine-type e2-small \
    --enable-autoscaling --min-nodes 1 --max-nodes 3
else
  echo "▶ creating AUTOPILOT cluster $CLUSTER_NAME"
  gcloud container clusters create-auto "$CLUSTER_NAME" \
    --region "$REGION" \
    --release-channel regular
  # Secret Manager add-on is enabled separately on Autopilot.
  gcloud container clusters update "$CLUSTER_NAME" \
    --region "$REGION" --enable-secret-manager || true
fi

# 2. GCP service account for Workload Identity (create-or-skip).
if ! gcloud iam service-accounts describe "$GSA_EMAIL" >/dev/null 2>&1; then
  echo "▶ creating service account $GSA_EMAIL"
  gcloud iam service-accounts create "$GSA_NAME" --display-name "PD GKE workload"
fi

echo "▶ granting secretAccessor on $MONGO_SECRET to $GSA_EMAIL"
gcloud secrets add-iam-policy-binding "$MONGO_SECRET" \
  --member "serviceAccount:$GSA_EMAIL" \
  --role roles/secretmanager.secretAccessor >/dev/null

echo "▶ binding Workload Identity ($KSA → $GSA_EMAIL)"
gcloud iam service-accounts add-iam-policy-binding "$GSA_EMAIL" \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT_ID}.svc.id.goog[${KSA_NS}/${KSA_NAME}]" >/dev/null

# 3. Reserved global static IP for the Ingress (create-or-skip).
if ! gcloud compute addresses describe "$STATIC_IP" --global >/dev/null 2>&1; then
  echo "▶ reserving global static IP $STATIC_IP"
  gcloud compute addresses create "$STATIC_IP" --global
fi
IP_ADDR=$(gcloud compute addresses describe "$STATIC_IP" --global --format 'value(address)')

cat <<EOF

✓ provisioned.
  Ingress static IP : $IP_ADDR  (point your domain's A record here)
  GSA email         : $GSA_EMAIL  (patch into serviceaccount.yaml annotation)

Next:
  gcloud container clusters get-credentials $CLUSTER_NAME --region $REGION
  # patch PROJECT_ID / domain / CORS placeholders, then:
  kubectl apply -k deploy/k8s/base
EOF

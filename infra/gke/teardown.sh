#!/usr/bin/env bash
# Tears down the GKE side (PD-050) so you stop paying for it — the learning
# exercise is reversible. Leaves the Cloud Run deploy, Artifact Registry, and the
# MONGODB_URI secret untouched; the external Mongo data is never touched.
#
# Required env: PROJECT_ID
# Optional env: REGION, CLUSTER_NAME, GSA_NAME, STATIC_IP (same defaults as provision.sh)

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID required}"
REGION="${REGION:-europe-west1}"
CLUSTER_NAME="${CLUSTER_NAME:-pd-gke}"
GSA_NAME="${GSA_NAME:-pd-gke-sa}"
STATIC_IP="${STATIC_IP:-pd-ingress-ip}"
GSA_EMAIL="${GSA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "▶ deleting app resources (best-effort)"
gcloud container clusters get-credentials "$CLUSTER_NAME" --region "$REGION" 2>/dev/null \
  && kubectl delete -k deploy/k8s/base --ignore-not-found || true

echo "▶ deleting cluster $CLUSTER_NAME"
gcloud container clusters delete "$CLUSTER_NAME" --region "$REGION" --quiet || true

echo "▶ releasing static IP $STATIC_IP"
gcloud compute addresses delete "$STATIC_IP" --global --quiet || true

echo "▶ deleting service account $GSA_EMAIL"
gcloud iam service-accounts delete "$GSA_EMAIL" --quiet || true

echo "✓ GKE resources removed. Cloud Run + Secret Manager + Mongo are untouched."

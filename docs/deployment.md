# Deployment

The app is deployed across Cloudflare Pages (frontend), **Google Cloud Run**
(Go API), and MongoDB Atlas (database). At family scale (~5–10 users) the whole
stack sits inside free tiers — **$0/mo**. See:

* [ADR-0002: Backend on Cloud Run](adrs/ADR-0002-backend-cloud-run.md) — why Cloud Run (supersedes the Fly.io tier of ADR-0001)
* [ADR-0001: Deployment stack](adrs/ADR-0001-deploy-stack.md) — the original Pages + Fly + Atlas split
* [PD-029: Cloud Run runbook](plans/PD-029-cloud-run-deploy.md) — step-by-step deploy + keyless CI setup
* [PD-012: Cloudflare + Fly + Atlas runbook](plans/PD-012-cloudflare-flyio-deploy.md) — the prior (Fly) runbook, kept as fallback

Once configured, both tiers auto-deploy on push to `main`: Cloudflare Pages
(frontend) and the [`deploy-cloudrun`](../.github/workflows/deploy-cloudrun.yml)
GitHub Action (backend, on `backend/**` changes). First/manual backend deploy:

```bash
GCP_PROJECT_ID=<proj> CORS_ALLOWED_ORIGINS=https://<app>.pages.dev \
  ./deploy/cloudrun/deploy.sh
```

`backend/fly.toml` is retained as a documented fallback (`cd backend && flyctl deploy`).

# Local setup

## Prerequisites

* [Docker](https://docker.com) (for MongoDB + Postgres)
* [Go 1.25+](https://go.dev/dl/)
* [Node.js 20+](https://nodejs.org)

## Quick start (local dev)

### 1. Start the databases

MongoDB (portfolio) and Postgres (gold tracking):

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Start the backend

```bash
cd backend
go mod tidy          # first time only
go run . serve
# API runs on http://localhost:8080
```

### 3. Start the frontend

```bash
cd frontend
npm install          # first time only
npm run dev
# App runs on http://localhost:3000
```

Open <http://localhost:3000>

## Full stack (Docker)

Builds and runs everything (MongoDB + Postgres + backend + frontend) in Docker:

```bash
docker compose up --build
```

App → <http://localhost:3000>
API → <http://localhost:8080>
OpenAPI spec → <http://localhost:8080/api/specs/openapi.yaml>

After first boot, see [First run & operations](operations.md) to complete the
super-admin onboarding.

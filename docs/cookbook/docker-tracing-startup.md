# Docker tracing startup: missing network and Tempo volume permissions

* Status: Resolved
* Last verified: 2026-11-12
* Environment: local Docker Compose; Tempo 2.7.2; Grafana OSS 11.6.1
* Related: [Local setup](../local-setup.md), [OTel runbook](../../plan.md),
  [cookbook](README.md)

## Problem and trigger

Running `make dev-trace` failed while starting the existing Tempo and Grafana
containers. MongoDB and Postgres were already running.

```text
failed to set up container networking: network <old-network-id> not found
```

After repairing the network references, Grafana started but Tempo exited with
a separate error:

```text
failed to create store: mkdir /tmp/tempo/blocks: permission denied
```

The Compose warning that `version` is obsolete was incidental to these failures.

## Reproduction and diagnostic aids

From the repository root, inspect container states and network references:

```bash
docker compose -f docker-compose.dev.yml --profile trace ps -a
docker network ls
docker inspect --format '{{.Name}} status={{.State.Status}} networks={{json .NetworkSettings.Networks}}' \
  portfolio_tempo_dev portfolio_grafana_dev portfolio_mongo_dev portfolio_postgres_dev
docker compose -f docker-compose.dev.yml --profile trace logs --tail 25 tempo grafana
```

For the permission error, inspect the image user and actual volume name:

```bash
docker image inspect grafana/tempo:2.7.2 --format '{{.Config.User}}'
docker inspect portfolio_tempo_dev \
  --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}}{{println}}{{end}}'
```

## Cause and evidence

The stopped tracing containers referenced a deleted network ID. The existing
`portfolio_dashboard_default` network had a different ID, used by the running
database containers. This confirmed stale references in the tracing containers;
the event that originally replaced the network was not established.

Tempo's image runs as `10001:10001`. Its named volume root was owned by `0:0`
with mode `0755`, preventing that user from creating `blocks` and `wal`.
The volume inspection and directory listing confirmed the ownership mismatch.

## Solution

Recreate only the tracing containers so Compose attaches them to the current
network. This leaves the database containers running and preserves Tempo's
named volume. Grafana has no persistent data volume in this Compose file, so
recreation resets container-local UI settings; its Tempo datasource is provisioned
from the repository configuration.

```bash
docker compose -f docker-compose.dev.yml --profile trace up -d \
  --no-deps --force-recreate tempo grafana
```

If Tempo then reports the permission error and the inspected user/ownership
matches the evidence above, repair only its local named volume. Confirm the
volume name first: the command below uses the name observed in this checkout.
It mounts an existing volume through a temporary container using the already
available Postgres image; it does not connect to or modify Postgres data.
The ownership change preserves trace files and allows Tempo's user to write.

```bash
docker run --rm --user 0:0 --entrypoint sh \
  --mount type=volume,source=portfolio_dashboard_tempo_data_dev,target=/tempo-data \
  postgres:17-alpine -c \
  'ls -ldn /tempo-data; chown -R 10001:10001 /tempo-data; ls -ldn /tempo-data'
docker compose -f docker-compose.dev.yml --profile trace up -d --no-deps tempo
```

## Verification

Tempo may return `503` while warming up. Wait for readiness, then check Grafana:

```bash
curl --fail --silent --show-error --retry 12 --retry-connrefused \
  --retry-delay 2 --retry-all-errors --max-time 3 http://localhost:3200/ready
curl --fail --silent --show-error --max-time 3 http://localhost:3001/api/health
```

Observed: Tempo returned `ready`; Grafana returned JSON with `database: "ok"`
and version `11.6.1`. The databases were left running. This verified service
readiness; backend trace ingestion was not exercised during this repair.

To use tracing, start the backend with the exporter enabled:

```bash
cd backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 go run . serve
```

Open Grafana at <http://localhost:3001> and use Explore → Tempo after making
backend requests.

## Follow-up

The local volume ownership was repaired manually. Automatic volume ownership
initialization in Compose remains a possible follow-up; no Compose configuration
was changed during this repair.

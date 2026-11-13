.PHONY: dev dev-db dev-trace prod down backend backend-trace frontend install tidy generate

# Start the dev databases only: MongoDB + Postgres (gold tracking)
dev-db:
	docker compose -f docker-compose.dev.yml up -d

# Start dev databases + Grafana Tempo trace stack (Tempo :4318, Grafana :3001)
# Or use make backend-trace to start these containers and the traced backend.
dev-trace:
	docker compose -f docker-compose.dev.yml --profile trace up -d

# Start full stack (production)
prod:
	docker compose up --build

# Stop all
down:
	docker compose down
	docker compose -f docker-compose.dev.yml down

# Run backend locally
backend:
	cd backend && go run . serve

# Start dev containers, then run the backend with traces sent to local Tempo.
# Clear inherited cloud headers and override the traces-specific endpoint too.
backend-trace: dev-trace
	OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces OTEL_EXPORTER_OTLP_HEADERS= OTEL_EXPORTER_OTLP_TRACES_HEADERS= $(MAKE) backend

# Run frontend locally
frontend:
	cd frontend && npm run dev

# Install frontend deps
install:
	cd frontend && npm install

# Go tidy
tidy:
	cd backend && go mod tidy

# Generate API types and server interface from OpenAPI spec
generate:
	cd backend && go generate ./...

# Full local dev (start the DBs, then open two tabs for backend + frontend)
dev: dev-db
	@echo ""
	@echo "MongoDB + Postgres running. Now open two terminals:"
	@echo "  Terminal 1: make backend"
	@echo "  Terminal 2: make frontend"

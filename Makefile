.PHONY: dev dev-db prod down backend frontend install tidy generate

# Start the dev databases only: MongoDB + Postgres (gold tracking)
dev-db:
	docker compose -f docker-compose.dev.yml up -d

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

.PHONY: dev prod down backend frontend seed

# Start MongoDB only (dev mode)
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
	cd backend && go run .

# Run frontend locally
frontend:
	cd frontend && npm run dev

# Install frontend deps
install:
	cd frontend && npm install

# Go tidy
tidy:
	cd backend && go mod tidy

# Full local dev (start mongo, then open two tabs for backend + frontend)
dev: dev-db
	@echo ""
	@echo "MongoDB running. Now open two terminals:"
	@echo "  Terminal 1: make backend"
	@echo "  Terminal 2: make frontend"

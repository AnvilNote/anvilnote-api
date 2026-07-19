# AnvilNote API Makefile
# A thin wrapper around pnpm so common workflows share one entry point.
# All comments are written in plain English without parentheses.

# Use pnpm as the package manager for every target.
PM := pnpm

# Use docker compose to run the local development database.
COMPOSE := docker compose

# Use the local environment file for required runtime settings.
ENV_FILE := .env
ENV_EXAMPLE := .env.example

# Treat these targets as commands rather than files on disk.
.PHONY: help install init-env dev build start lint typecheck check format clean reset prisma-generate prisma-migrate prisma-studio db-up db-down db-logs

# Show this help message when make runs without a target.
.DEFAULT_GOAL := help

help: ## List all available targets with a short description
	@echo "AnvilNote API - available make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install all project dependencies from the lockfile
	$(PM) install

init-env: ## Create .env from .env.example when the local file is missing
	@if [ -f "$(ENV_FILE)" ]; then \
		echo "$(ENV_FILE) already exists"; \
	else \
		cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
		echo "Created $(ENV_FILE) from $(ENV_EXAMPLE)"; \
	fi

db-up: ## Start the local Postgres container and wait until it is ready
	$(COMPOSE) up -d --wait postgres
	@echo "Database is up on localhost:55432"

db-down: ## Stop the local Postgres container but keep its data volume
	$(COMPOSE) down

db-logs: ## Follow the local Postgres container logs
	$(COMPOSE) logs -f postgres

dev: db-up ## Start the Express development server with hot reload
	@if [ ! -f "$(ENV_FILE)" ]; then \
		cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
		echo "Created $(ENV_FILE) from $(ENV_EXAMPLE)"; \
		echo "Review DATABASE_URL before first real run if your local Postgres differs."; \
	fi
	@if ! grep -Eq '^[[:space:]]*DATABASE_URL=' "$(ENV_FILE)"; then \
		echo "Missing DATABASE_URL in $(ENV_FILE). Update the file before starting the API."; \
		exit 1; \
	fi
	HOST=127.0.0.1 $(PM) dev

build: ## Compile the TypeScript source into dist
	$(PM) build

start: ## Run the compiled production server
	@if [ ! -f "$(ENV_FILE)" ]; then \
		cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
		echo "Created $(ENV_FILE) from $(ENV_EXAMPLE)"; \
		echo "Review DATABASE_URL before first real run if your local Postgres differs."; \
	fi
	@if ! grep -Eq '^[[:space:]]*DATABASE_URL=' "$(ENV_FILE)"; then \
		echo "Missing DATABASE_URL in $(ENV_FILE). Update the file before starting the API."; \
		exit 1; \
	fi
	$(PM) start

lint: ## Run ESLint across the whole project
	$(PM) lint

typecheck: ## Run the TypeScript compiler in no-emit mode
	$(PM) exec tsc --noEmit

# Run linting and type checking together as a quick quality gate.
check: lint typecheck ## Run lint and typecheck in sequence

format: ## Format the source tree with Prettier
	$(PM) exec prettier --write .

prisma-generate: ## Generate the Prisma client from the schema
	$(PM) prisma:generate

prisma-migrate: ## Run the Prisma development migration workflow
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo "Missing $(ENV_FILE). Copy .env.example first:"; \
		echo "  cp .env.example .env"; \
		exit 1; \
	fi
	@if ! grep -Eq '^[[:space:]]*DATABASE_URL=' "$(ENV_FILE)"; then \
		echo "Missing DATABASE_URL in $(ENV_FILE). Update the file before running migrations."; \
		exit 1; \
	fi
	$(PM) prisma:migrate

prisma-studio: ## Open Prisma Studio for the local database
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo "Missing $(ENV_FILE). Copy .env.example first:"; \
		echo "  cp .env.example .env"; \
		exit 1; \
	fi
	@if ! grep -Eq '^[[:space:]]*DATABASE_URL=' "$(ENV_FILE)"; then \
		echo "Missing DATABASE_URL in $(ENV_FILE). Update the file before opening Prisma Studio."; \
		exit 1; \
	fi
	$(PM) prisma:studio

clean: ## Remove build output and local caches
	rm -rf dist coverage *.tsbuildinfo

# Wipe installed dependencies on top of the normal clean step.
reset: clean ## Remove node_modules in addition to build output
	rm -rf node_modules

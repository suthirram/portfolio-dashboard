// Postgres connection + embedded schema migrations. Gold data (PRD-003 /
// DD-003) lives in Postgres while everything else stays in MongoDB; the
// pool is optional at boot — callers treat a nil pool as "gold disabled".
package db

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// ConnectPostgres opens a pgx pool and verifies connectivity with a ping.
func ConnectPostgres(ctx context.Context, uri string, logger *zap.Logger) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, uri)
	if err != nil {
		return nil, fmt.Errorf("parse postgres uri: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	logger.Info("connected to postgres")
	return pool, nil
}

// MigratePostgres applies any embedded migrations not yet recorded in
// schema_migrations. Each migration runs in its own transaction together
// with the version bookkeeping row, so a failed migration leaves no
// half-applied state and the next boot retries it.
func MigratePostgres(ctx context.Context, pool *pgxpool.Pool, logger *zap.Logger) error {
	files, err := migrationFiles()
	if err != nil {
		return err
	}

	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("ensure schema_migrations: %w", err)
	}

	applied := map[string]bool{}
	rows, err := pool.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("read schema_migrations: %w", err)
	}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return fmt.Errorf("scan schema_migrations: %w", err)
		}
		applied[v] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate schema_migrations: %w", err)
	}

	for _, name := range files {
		if applied[name] {
			continue
		}
		sql, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
		logger.Info("applied postgres migration", zap.String("version", name))
	}
	return nil
}

// migrationFiles lists the embedded migrations in apply order and rejects
// malformed or duplicate version prefixes at boot rather than mid-apply.
func migrationFiles() ([]string, error) {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return orderMigrations(names)
}

// orderMigrations validates NNNN_name.sql filenames and returns them sorted
// by numeric prefix. Split out from the embed so it is unit-testable.
func orderMigrations(names []string) ([]string, error) {
	seen := map[string]string{}
	for _, name := range names {
		if !strings.HasSuffix(name, ".sql") {
			return nil, fmt.Errorf("migration %q: not a .sql file", name)
		}
		prefix, _, ok := strings.Cut(name, "_")
		if !ok || len(prefix) != 4 {
			return nil, fmt.Errorf("migration %q: want NNNN_name.sql", name)
		}
		for _, r := range prefix {
			if r < '0' || r > '9' {
				return nil, fmt.Errorf("migration %q: non-numeric version prefix", name)
			}
		}
		if prev, dup := seen[prefix]; dup {
			return nil, fmt.Errorf("duplicate migration version %s: %q and %q", prefix, prev, name)
		}
		seen[prefix] = name
	}
	out := append([]string(nil), names...)
	sort.Strings(out)
	return out, nil
}

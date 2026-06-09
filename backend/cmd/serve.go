package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/spf13/cobra"

	"portfolio-dashboard/api"
	"portfolio-dashboard/db"
	"portfolio-dashboard/handlers"
)

var (
	flagPort     string
	flagMongoURI string
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the HTTP API server",
	RunE:  runServe,
}

func init() {
	serveCmd.Flags().StringVar(&flagPort, "port", "8080", "HTTP listen port ($PORT)")
	serveCmd.Flags().StringVar(&flagMongoURI, "mongo-uri", "mongodb://localhost:27017/portfolio", "MongoDB connection URI ($MONGODB_URI)")
}

func runServe(_ *cobra.Command, _ []string) error {
	port := envOr("PORT", flagPort)
	mongoURI := envOr("MONGODB_URI", flagMongoURI)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := db.Connect(ctx, mongoURI)
	if err != nil {
		return fmt.Errorf("connecting to MongoDB: %w", err)
	}
	defer client.Disconnect(context.Background()) //nolint:errcheck

	database := client.Database("portfolio")
	if err := db.EnsureIndexes(context.Background(), database); err != nil {
		log.Printf("warning: index creation failed: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		MaxAge:         300,
	}))

	r.Get("/api/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		http.ServeFile(w, r, "api/openapi.yaml")
	})

	h := handlers.New(database)
	strictHandler := api.NewStrictHandler(h, nil)
	api.HandlerFromMuxWithBaseURL(strictHandler, r, "/api")

	log.Printf("Portfolio API listening on :%s", port)
	return http.ListenAndServe(":"+port, r)
}

// envOr returns the environment variable value if set, otherwise the fallback.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"portfolio-dashboard/db"
	"portfolio-dashboard/handlers"
)

func main() {
	port := getEnv("PORT", "8080")
	mongoURI := getEnv("MONGODB_URI", "mongodb://localhost:27017/portfolio")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := db.Connect(ctx, mongoURI)
	if err != nil {
		log.Fatalf("MongoDB connect failed: %v", err)
	}
	defer client.Disconnect(context.Background())

	database := client.Database("portfolio")
	if err := db.EnsureIndexes(context.Background(), database); err != nil {
		log.Printf("Warning: index creation failed: %v", err)
	}

	h := handlers.New(database)

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

	// Serve OpenAPI spec
	r.Get("/api/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		http.ServeFile(w, r, "api/openapi.yaml")
	})

	r.Route("/api", func(r chi.Router) {
		r.Route("/holdings", func(r chi.Router) {
			r.Get("/", h.ListHoldings)
			r.Post("/", h.CreateHolding)
			r.Get("/{id}", h.GetHolding)
			r.Put("/{id}", h.UpdateHolding)
			r.Delete("/{id}", h.DeleteHolding)
		})
		r.Get("/prices", h.GetPrices)
		r.Get("/summary", h.GetSummary)
		r.Get("/market/price", h.GetMarketPrice)
		r.Get("/market/forex", h.GetForexRate)
	})

	log.Printf("Portfolio API listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

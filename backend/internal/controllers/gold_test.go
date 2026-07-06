package controllers

import (
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// TestGoldRoutes_UnavailableWithoutPostgres pins the DD-003 §1 degrade
// path: with no Postgres attached (h.gold == nil) every gold operation
// answers 503 instead of crashing or pretending success.
func TestGoldRoutes_UnavailableWithoutPostgres(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("all gold ops answer 503", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		ctx := userCtx(&domain.User{Role: domain.RoleUser, GoldEnabled: true})
		body := api.GoldTransactionInput{
			Date:        openapi_types.Date{Time: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)},
			GmPrice:     7275,
			GramsBought: 8,
			ActualPaid:  59500,
		}

		if resp, err := h.ListGoldTransactions(ctx, api.ListGoldTransactionsRequestObject{}); err != nil {
			t.Fatalf("list: %v", err)
		} else if _, ok := resp.(api.ListGoldTransactions503JSONResponse); !ok {
			t.Errorf("list response = %T, want 503", resp)
		}

		if resp, err := h.CreateGoldTransaction(ctx, api.CreateGoldTransactionRequestObject{Body: &body}); err != nil {
			t.Fatalf("create: %v", err)
		} else if _, ok := resp.(api.CreateGoldTransaction503JSONResponse); !ok {
			t.Errorf("create response = %T, want 503", resp)
		}

		if resp, err := h.UpdateGoldTransaction(ctx, api.UpdateGoldTransactionRequestObject{Id: 1, Body: &body}); err != nil {
			t.Fatalf("update: %v", err)
		} else if _, ok := resp.(api.UpdateGoldTransaction503JSONResponse); !ok {
			t.Errorf("update response = %T, want 503", resp)
		}

		if resp, err := h.DeleteGoldTransaction(ctx, api.DeleteGoldTransactionRequestObject{Id: 1}); err != nil {
			t.Fatalf("delete: %v", err)
		} else if _, ok := resp.(api.DeleteGoldTransaction503JSONResponse); !ok {
			t.Errorf("delete response = %T, want 503", resp)
		}

		if resp, err := h.ListGoldPrices(ctx, api.ListGoldPricesRequestObject{}); err != nil {
			t.Fatalf("prices list: %v", err)
		} else if _, ok := resp.(api.ListGoldPrices503JSONResponse); !ok {
			t.Errorf("prices list response = %T, want 503", resp)
		}

		prices := []api.GoldPrice{{Date: body.Date, PricePerGram: 7000}}
		if resp, err := h.PutGoldPrices(ctx, api.PutGoldPricesRequestObject{Body: (*api.PutGoldPricesJSONRequestBody)(&prices)}); err != nil {
			t.Fatalf("prices put: %v", err)
		} else if _, ok := resp.(api.PutGoldPrices503JSONResponse); !ok {
			t.Errorf("prices put response = %T, want 503", resp)
		}

		if resp, err := h.ListGoldMissingDates(ctx, api.ListGoldMissingDatesRequestObject{}); err != nil {
			t.Fatalf("missing-dates: %v", err)
		} else if _, ok := resp.(api.ListGoldMissingDates503JSONResponse); !ok {
			t.Errorf("missing-dates response = %T, want 503", resp)
		}
	})
}

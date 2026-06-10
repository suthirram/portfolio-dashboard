package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Holding represents a stock/ETF position in the portfolio
type Holding struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Script       string             `bson:"script" json:"script"`                 // display name (e.g. "TCS", "GOLD BEES")
	Symbol       string             `bson:"symbol" json:"symbol"`                 // Yahoo Finance ticker (e.g. "TCS.NS", "GOLDBEES.NS")
	Exchange     string             `bson:"exchange" json:"exchange"`             // NSE, BSE, NYSE, NASDAQ
	Type         string             `bson:"type" json:"type"`                     // stock | etf
	StocksOwned  float64            `bson:"stocks_owned" json:"stocks_owned"`     // current quantity held
	AvgCostPrice float64            `bson:"avg_cost_price" json:"avg_cost_price"` // average buy price per share, in Currency
	RealizedPnL  float64            `bson:"realized_pnl" json:"realized_pnl"`     // profit/loss from sold shares, in Currency
	Currency     string             `bson:"currency" json:"currency"`             // "INR" or "EUR"; defaults to "INR"
	Notes        string             `bson:"notes,omitempty" json:"notes,omitempty"`
	CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time          `bson:"updated_at" json:"updated_at"`
}

// HoldingWithPrice adds live market data to a Holding
type HoldingWithPrice struct {
	Holding
	CurrentPrice     float64 `json:"current_price"`
	CostPrice        float64 `json:"cost_price"`     // stocks_owned × avg_cost_price
	CurrentValue     float64 `json:"current_value"`  // stocks_owned × current_price
	UnrealizedPnL    float64 `json:"unrealized_pnl"` // current_value − cost_price
	CostPriceEUR     float64 `json:"cost_price_eur"`
	CurrentValueEUR  float64 `json:"current_value_eur"`
	UnrealizedPnLEUR float64 `json:"unrealized_pnl_eur"`
	RealizedPnLEUR   float64 `json:"realized_pnl_eur"`
	PriceError       string  `json:"price_error,omitempty"`
}

// PricesResponse wraps holdings-with-prices and the live EUR rate
type PricesResponse struct {
	Holdings []HoldingWithPrice `json:"holdings"`
	EURRate  float64            `json:"eur_rate"` // 1 INR = X EUR
}

// Summary is the portfolio-level aggregate
type Summary struct {
	TotalCost            float64 `json:"total_cost"`
	TotalCurrentValue    float64 `json:"total_current_value"`
	TotalUnrealized      float64 `json:"total_unrealized"`
	TotalRealized        float64 `json:"total_realized"`
	TotalCostEUR         float64 `json:"total_cost_eur"`
	TotalCurrentValueEUR float64 `json:"total_current_value_eur"`
	TotalUnrealizedEUR   float64 `json:"total_unrealized_eur"`
	TotalRealizedEUR     float64 `json:"total_realized_eur"`
	EURRate              float64 `json:"eur_rate"`
}

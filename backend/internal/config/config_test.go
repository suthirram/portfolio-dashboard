package config

import (
	"testing"
)

func TestApplyEnv_RateLimitUnset_KeepsDefaults(t *testing.T) {
	t.Setenv("RATE_LIMIT_RPM", "")
	t.Setenv("RATE_LIMIT_MARKET_RPM", "")

	c := Default()
	c.ApplyEnv()

	if c.RateLimitRPM != 0 {
		t.Errorf("RateLimitRPM = %d, want 0", c.RateLimitRPM)
	}
	if c.RateLimitMarketRPM != 0 {
		t.Errorf("RateLimitMarketRPM = %d, want 0", c.RateLimitMarketRPM)
	}
}

func TestApplyEnv_RateLimitSet_ParsesInts(t *testing.T) {
	t.Setenv("RATE_LIMIT_RPM", "60")
	t.Setenv("RATE_LIMIT_MARKET_RPM", "20")

	c := Default()
	c.ApplyEnv()

	if c.RateLimitRPM != 60 {
		t.Errorf("RateLimitRPM = %d, want 60", c.RateLimitRPM)
	}
	if c.RateLimitMarketRPM != 20 {
		t.Errorf("RateLimitMarketRPM = %d, want 20", c.RateLimitMarketRPM)
	}
}

func TestApplyEnv_RateLimitZeroExplicit_StaysDisabled(t *testing.T) {
	t.Setenv("RATE_LIMIT_RPM", "0")
	t.Setenv("RATE_LIMIT_MARKET_RPM", "0")

	c := Default()
	c.RateLimitRPM = 99 // ensure 0 from env actually overrides
	c.RateLimitMarketRPM = 99
	c.ApplyEnv()

	if c.RateLimitRPM != 0 {
		t.Errorf("RateLimitRPM = %d, want 0", c.RateLimitRPM)
	}
	if c.RateLimitMarketRPM != 0 {
		t.Errorf("RateLimitMarketRPM = %d, want 0", c.RateLimitMarketRPM)
	}
}

func TestApplyEnv_RateLimitInvalid_LeavesPriorValue(t *testing.T) {
	t.Setenv("RATE_LIMIT_RPM", "not-a-number")

	c := Default()
	c.RateLimitRPM = 30
	c.ApplyEnv()

	if c.RateLimitRPM != 30 {
		t.Errorf("RateLimitRPM = %d, want 30 (invalid env should be ignored)", c.RateLimitRPM)
	}
}

func TestValidate_NegativeRateLimit_Errors(t *testing.T) {
	c := Default()
	c.RateLimitRPM = -1
	if err := c.Validate(); err == nil {
		t.Error("expected error for negative RateLimitRPM, got nil")
	}

	c = Default()
	c.RateLimitMarketRPM = -5
	if err := c.Validate(); err == nil {
		t.Error("expected error for negative RateLimitMarketRPM, got nil")
	}
}

func TestApplyEnv_CORSAllowedOrigins_ParsesAndTrims(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://a.example , https://b.example ,, https://c.example")

	c := Default()
	c.ApplyEnv()

	want := []string{"https://a.example", "https://b.example", "https://c.example"}
	if len(c.CORSAllowedOrigins) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(c.CORSAllowedOrigins), len(want), c.CORSAllowedOrigins)
	}
	for i, v := range want {
		if c.CORSAllowedOrigins[i] != v {
			t.Errorf("CORSAllowedOrigins[%d] = %q, want %q", i, c.CORSAllowedOrigins[i], v)
		}
	}
}

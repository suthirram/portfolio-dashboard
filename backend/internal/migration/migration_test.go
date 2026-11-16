package migration

import "testing"

func TestValidate(t *testing.T) {
	steps := func(versions ...string) []Step {
		registry := make([]Step, 0, len(versions))
		for _, version := range versions {
			registry = append(registry, &batchStep{version: version, batches: 1})
		}
		return registry
	}
	testCases := []struct {
		name    string
		steps   []Step
		wantErr bool
	}{
		{"empty registry", nil, false},
		{"ordered versions", steps("20261116_01", "20261116_02", "20261201_01"), false},
		{"dashes instead of underscore", steps("2026-11-16"), true},
		{"missing sequence number", steps("20261116"), true},
		{"slug instead of number", steps("20261116_sectors"), true},
		{"duplicate version", steps("20261116_01", "20261116_01"), true},
		{"out of order", steps("20261120_01", "20261116_01"), true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if err := Validate(testCase.steps); (err != nil) != testCase.wantErr {
				t.Errorf("Validate = %v; wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

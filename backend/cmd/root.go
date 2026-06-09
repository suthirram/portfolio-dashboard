// Package cmd defines the cobra command tree for the portfolio API.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:           "portfolio-dashboard",
	Short:         "Portfolio dashboard API server",
	Long:          "Portfolio dashboard backend: tracks NSE/BSE/US holdings with live Yahoo Finance quotes and INR/EUR conversion.",
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute runs the root command and is the single entry point from main.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(serveCmd)
}

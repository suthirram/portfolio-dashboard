#!/usr/bin/env sh
set -eu

profile="${1:-${TMPDIR:-/tmp}/portfolio-backend-coverage.out}"
coverage_pkgs="./internal/config ./internal/handlers ./internal/httpserver ./internal/logging ./internal/services"

go test ./...
go test $coverage_pkgs -covermode=atomic -coverprofile="$profile"

go tool cover -func="$profile"

awk '
NR == 1 { next }
{
	total += $2
	if ($3 > 0) {
		covered += $2
	}
}
END {
	if (total == 0) {
		print "application coverage: no statements"
		exit 1
	}
	printf "application coverage: %.1f%% (%d/%d statements)\n", covered * 100 / total, covered, total
	if ((covered * 100 / total) < 90) {
		exit 1
	}
}
' "$profile"

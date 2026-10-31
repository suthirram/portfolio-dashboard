#!/usr/bin/env bash
# test.sh — behaviour tests for the project-rule checks. Run in CI
# (pr-rules.yml) and locally: bash scripts/rules/test.sh
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0 fail=0

expect() { # expect <ok|fail> <name> <command…>
  local want="$1" name="$2"; shift 2
  if "$@" >/dev/null 2>&1; then got=ok; else got=fail; fi
  if [[ "$got" == "$want" ]]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: $name (want $want, got $got)"; fi
}

# ---- commit messages ----
msg() { printf '%s\n' "$@" > "$tmp/msg"; echo "$tmp/msg"; }
expect ok   "gitmoji subject"           "$here/check-commit-msg.sh" "$(msg '✨ Add the dividend tab')"
expect ok   "shortcode gitmoji"         "$here/check-commit-msg.sh" "$(msg ':sparkles: Add the dividend tab')"
expect ok   "merge commit"              "$here/check-commit-msg.sh" "$(msg "Merge branch 'main' into feat/x")"
expect ok   "50 chars with an em dash"  "$here/check-commit-msg.sh" "$(msg '📝 Align PD-048 with rules — fifty characters ok!!')"
expect fail "no gitmoji"                "$here/check-commit-msg.sh" "$(msg 'Add the dividend tab')"
expect fail "subject over 50"           "$here/check-commit-msg.sh" "$(msg '✨ Add the dividend tab with running totals and every analytic')"
expect fail "Claude co-author trailer"  "$here/check-commit-msg.sh" "$(msg '✨ Add x' '' 'Co-Authored-By: Claude Opus <noreply@anthropic.com>')"
expect fail "emoji only"                "$here/check-commit-msg.sh" "$(msg '✨')"

# ---- PR checks ----
good_body() {
  cat > "$tmp/body" <<'EOF'
## What
Serves the dividend tab.

## How to test
1. Run the curl below.
```bash
curl -s -b c.txt "$B/dividends?currency=INR"
```
- Automated: `go test ./...`

## No regression
Additive routes only.
EOF
  echo "$tmp/body"
}
files() { printf '%s\n' "$@" > "$tmp/files"; echo "$tmp/files"; }
expect ok   "good PR"            "$here/check-pr.sh" --title "✨ Serve the dividend tab" --body-file "$(good_body)" --files-file "$(files backend/api/specs/x.yaml backend/a.go)"
expect fail "title no gitmoji"   "$here/check-pr.sh" --title "Serve the dividend tab" --body-file "$(good_body)" --files-file "$(files backend/a.go)"
expect fail "title period"       "$here/check-pr.sh" --title "✨ Serve the dividend tab." --body-file "$(good_body)" --files-file "$(files backend/a.go)"
expect fail "FE+BE in one PR"    "$here/check-pr.sh" --title "✨ X" --body-file "$(good_body)" --files-file "$(files backend/a.go frontend/b.tsx)"
{ good_body >/dev/null; echo 'FE/BE-EXCEPTION: owner asked for one PR' >> "$tmp/body"; }
expect ok   "FE+BE with exception" "$here/check-pr.sh" --title "✨ X" --body-file "$tmp/body" --files-file "$(files backend/a.go frontend/b.tsx)"
{ good_body >/dev/null; /usr/bin/grep -v '^## No regression' "$tmp/body" > "$tmp/b2"; }
expect fail "missing section"    "$here/check-pr.sh" --title "✨ X" --body-file "$tmp/b2" --files-file "$(files docs/a.md)"
{ good_body >/dev/null; /usr/bin/grep -v 'curl' "$tmp/body" > "$tmp/b3"; }
expect fail "spec change, no curl" "$here/check-pr.sh" --title "✨ X" --body-file "$tmp/b3" --files-file "$(files backend/api/specs/x.yaml)"
expect ok   "docs change, no curl" "$here/check-pr.sh" --title "📝 X" --body-file "$tmp/b3" --files-file "$(files docs/a.md)"
{ good_body >/dev/null; printf '\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n' >> "$tmp/body"; }
expect fail "attribution in body" "$here/check-pr.sh" --title "✨ X" --body-file "$tmp/body" --files-file "$(files docs/a.md)"
{ good_body >/dev/null; for _ in $(seq 1 40); do echo 'five more words of prose' >> "$tmp/body"; done; }
expect fail "over 200 words"     "$here/check-pr.sh" --title "✨ X" --body-file "$tmp/body" --files-file "$(files docs/a.md)"
{ good_body >/dev/null; printf '```bash\n' >> "$tmp/body"; for _ in $(seq 1 60); do echo 'curl -s one two three four' >> "$tmp/body"; done; printf '```\n' >> "$tmp/body"; }
expect ok   "long code block is not prose" "$here/check-pr.sh" --title "✨ X" --body-file "$tmp/body" --files-file "$(files docs/a.md)"

# ---- PR diff range (stacked PRs check only their own slice) ----
range() { bash -c 'source "$1/lib.sh"; [[ "$(pr_diff_range "$2")" == "$3" ]]' _ "$here" "$1" "$2"; }
expect ok   "range defaults to main...HEAD" range "create --title x" "origin/main...HEAD"
expect ok   "range honours --base/--head"   range "create --base feat/a --head feat/b --title x" "origin/feat/a...origin/feat/b"
expect ok   "range honours -B=base"         range "create -B=feat/a" "origin/feat/a...HEAD"

# ---- Claude Code Bash guard ----
guard() { # guard <ok|fail> <name> <command>
  local out
  out=$(jq -n --arg c "$3" '{tool_name: "Bash", tool_input: {command: $c}}' | "$here/guard-claude-bash.sh")
  if [[ "$out" == *'"deny"'* ]]; then got=fail; else got=ok; fi
  if [[ "$got" == "$1" ]]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: guard: $2 (want $1, got $got)"; fi
}
guard ok   "plain command"          "go test ./..."
guard fail "reads seed.env"         "cat scripts/seed.env"
guard fail "sed -i on Go"           "sed -i '' 's/a/b/' backend/x.go"
guard fail "perl -pi on TS"         "perl -pi -e 's/a/b/' frontend/src/a.ts"
guard ok   "sed read-only"          "sed -n 1,20p backend/x.go"
guard fail "Claude trailer in commit" $'git commit -m "✨ X\n\nCo-Authored-By: Claude <noreply@anthropic.com>"'
guard fail "inline --body"          "gh pr create --title '✨ X' --body 'hi'"
guard fail "create without body"    "gh pr create --title '✨ X'"
guard ok   "checkout -b then create" "git checkout -b docs/x && gh pr create --title '📝 Add docs' --body-file $(good_body)"
guard fail "bad title"              "gh pr create --title 'Add docs' --body-file $(good_body)"
guard ok   "edit labels only"       "gh pr edit 12 --add-label dev"

echo "rules tests: $pass passed, $fail failed"
(( fail == 0 ))

#!/usr/bin/env bash
# guard-claude-bash.sh — Claude Code PreToolUse hook for Bash
# (.claude/settings.json). Reads the hook payload on stdin and denies a
# command that breaks a CLAUDE.md project rule, with the reason shown to
# Claude so it can fix the command and retry:
#   * any reference to scripts/seed.env (secrets; never read);
#   * sed -i / perl -i rewrites of source files (use the Edit tool);
#   * AI attribution in a git commit;
#   * gh pr create/edit with an inline --body (use --body-file), or whose
#     title/body/changed files fail check-pr.sh.
# Anything else passes through untouched (exit 0, no output).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/lib.sh"

cmd=$(jq -r '.tool_input.command // empty')
[[ -z "$cmd" ]] && exit 0

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

if [[ "$cmd" == *seed.env* ]]; then
  deny "scripts/seed.env holds secrets and must never be read or touched (CLAUDE.md → Read access restriction)."
fi

if [[ "$cmd" =~ (^|[^[:alnum:]_])(sed[[:space:]]+(-[[:alpha:]]*i|--in-place)|perl[[:space:]]+-[[:alpha:]]*i) ]] \
  && [[ "$cmd" =~ \.(go|ts|tsx|js|jsx|sql|ya?ml)([^[:alnum:]]|$) ]]; then
  deny "Edit source files with the Edit tool, not sed -i / perl -i (CLAUDE.md → Project rules → Code)."
fi

if [[ "$cmd" =~ (^|[^[:alnum:]_])git[[:space:]]+commit ]] && printf '%s' "$cmd" | has_ai_attribution; then
  deny "Remove the AI attribution (Co-Authored-By: Claude / Generated with Claude Code) from the commit message (CLAUDE.md → Project rules)."
fi

if [[ "$cmd" =~ (^|[^[:alnum:]_])gh[[:space:]]+pr[[:space:]]+(create|edit) ]]; then
  action="${BASH_REMATCH[2]}"
  # Parse only the gh segment, so flags of earlier commands in the same line
  # (e.g. `git checkout -b x && gh pr create …`) are not mistaken for gh's.
  seg="${cmd#*gh pr }"
  seg="${seg%%&&*}"
  seg="${seg%%;*}"
  if [[ "$seg" =~ (^|[[:space:]])(--body|-b)([[:space:]]|=) ]]; then
    deny "Pass the PR description with --body-file <path> (a literal path) so the PR rules can be checked, not inline --body."
  fi

  title=""
  if [[ "$seg" =~ (--title|-t)[[:space:]]+\"([^\"]*)\" ]] || [[ "$seg" =~ (--title|-t)[[:space:]]+\'([^\']*)\' ]]; then
    title="${BASH_REMATCH[2]}"
  fi

  body_file=""
  if [[ "$seg" =~ (--body-file|-F)[[:space:]]+([^[:space:]\;\&\|]+) ]]; then
    body_file="$(unquote "${BASH_REMATCH[2]}")"
    if [[ ! -r "$body_file" ]]; then
      deny "PR body file '$body_file' is not readable here; pass a literal path to an existing file with --body-file."
    fi
  fi

  if [[ "$action" == "create" && -z "$body_file" ]]; then
    deny "gh pr create needs --body-file <path> with ## What / ## How to test / ## No regression (CLAUDE.md → Project rules)."
  fi

  files_file=$(mktemp)
  trap 'rm -f "$files_file"' EXIT
  # Fail closed: an unresolved range is not an empty diff, or the FE/BE split
  # and curl checks would silently pass. Files only matter with a body.
  if [[ -z "$body_file" ]]; then
    :
  elif [[ "$action" == "create" ]]; then
    range="$(pr_diff_range "$seg")"
    if ! git diff --name-only "$range" > "$files_file" 2>/dev/null; then
      deny "Cannot list the PR's changed files ($range does not resolve); push both branches and git fetch first."
    fi
  elif [[ "$seg" =~ ^edit[[:space:]]+([0-9]+) ]]; then
    if ! gh pr view "${BASH_REMATCH[1]}" --json files --jq '.files[].path' > "$files_file" 2>/dev/null; then
      deny "Cannot list PR #${BASH_REMATCH[1]}'s changed files; check gh auth and retry."
    fi
  fi

  args=()
  [[ -n "$title" ]] && args+=(--title "$title")
  [[ -n "$body_file" ]] && args+=(--body-file "$body_file" --files-file "$files_file")
  if (( ${#args[@]} )); then
    if ! report=$("$here/check-pr.sh" "${args[@]}" 2>&1); then
      deny "$report"
    fi
  fi
fi

exit 0

#!/usr/bin/env bash
# check-pr.sh --title <title> --body-file <file> --files-file <file>
#
# The PR rules from CLAUDE.md ("Project rules → Commits and PRs"):
#   * title starts with a gitmoji and has no trailing period;
#   * body has ## What / ## How to test / ## No regression;
#   * body prose (outside code fences) is under 200 words;
#   * no AI attribution;
#   * frontend/ and backend/ never change in one PR (unless the body carries
#     an "FE/BE-EXCEPTION: <reason>" line — the owner asked for it);
#   * a PR that changes the API spec (backend/api/specs/) includes a curl.
# --files-file lists the PR's changed paths, one per line.
# Used by CI (.github/workflows/pr-rules.yml) and the Claude Code hook
# (guard-claude-bash.sh). Prints every violation, exits 1 if there is any.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

title="" body_file="" files_file=""
while (( $# )); do
  case "$1" in
    --title) title="$2"; shift 2 ;;
    --body-file) body_file="$2"; shift 2 ;;
    --files-file) files_file="$2"; shift 2 ;;
    *) echo "check-pr: unknown argument $1" >&2; exit 2 ;;
  esac
done

problems=()

if [[ -n "$title" ]]; then
  starts_with_gitmoji "$title" || problems+=("title must start with a gitmoji: '$title'")
  [[ "$title" == *. ]] && problems+=("title must not end with a period")
fi

if [[ -n "$body_file" ]]; then
  for section in '## What' '## How to test' '## No regression'; do
    /usr/bin/grep -qxF "$section" "$body_file" || problems+=("body is missing the '$section' section")
  done
  words=$(prose_word_count < "$body_file")
  (( words >= 200 )) && problems+=("body has $words words of prose; keep it under 200 (code blocks don't count)")
  has_ai_attribution < "$body_file" && problems+=("body carries an AI attribution line; remove it")

  if [[ -n "$files_file" ]]; then
    if /usr/bin/grep -q '^frontend/' "$files_file" && /usr/bin/grep -q '^backend/' "$files_file" \
      && ! /usr/bin/grep -q '^FE/BE-EXCEPTION:' "$body_file"; then
      problems+=("PR changes both frontend/ and backend/; split it (backend first) or add an 'FE/BE-EXCEPTION: <reason>' line when the owner asked for one PR")
    fi
    if /usr/bin/grep -q '^backend/api/specs/' "$files_file" && ! /usr/bin/grep -q 'curl ' "$body_file"; then
      problems+=("PR changes the API spec but How to test has no curl commands")
    fi
  fi
fi

if (( ${#problems[@]} )); then
  echo "PR rules (CLAUDE.md → Project rules) not met:" >&2
  printf '  - %s\n' "${problems[@]}" >&2
  exit 1
fi

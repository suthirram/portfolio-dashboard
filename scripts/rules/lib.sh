#!/usr/bin/env bash
# Shared helpers for the project-rule checks (CLAUDE.md "Project rules").
# Sourced by check-commit-msg.sh, check-pr.sh and guard-claude-bash.sh so a
# rule is written once and every entry point (git hook, CI, Claude Code hook)
# enforces the same thing.

# utf8_locale prints a UTF-8 locale available on this machine, so character
# counts treat multi-byte characters (→, —, ₹) as one character.
utf8_locale() {
  local l
  for l in C.UTF-8 en_US.UTF-8 C.utf8 en_US.utf8; do
    if locale -a 2>/dev/null | /usr/bin/grep -qx "$l"; then
      echo "$l"
      return
    fi
  done
  echo C
}

# char_count prints the number of characters in $1.
char_count() {
  printf '%s' "$1" | LC_ALL="$(utf8_locale)" wc -m | tr -d ' '
}

# starts_with_gitmoji succeeds when $1 starts with an emoji (any non-ASCII
# first character) or a :shortcode: followed by a space.
starts_with_gitmoji() {
  local s="$1"
  if [[ "$s" =~ ^:[a-z0-9_+-]+:\  ]]; then
    return 0
  fi
  local first
  first=$(printf '%s' "$s" | head -c1)
  [[ -n "$first" ]] && printf '%s' "$first" | LC_ALL=C /usr/bin/grep -q '[^ -~]'
}

# after_gitmoji prints $1 without its leading emoji/shortcode token and the
# space after it.
after_gitmoji() {
  local s="$1"
  printf '%s' "${s#* }"
}

# has_ai_attribution succeeds when the text on stdin carries an AI attribution
# line (Co-Authored-By: Claude/Anthropic, or "Generated with Claude Code").
has_ai_attribution() {
  /usr/bin/grep -qiE '(co-authored-by:.*(claude|anthropic))|(generated with \[?claude)'
}

# prose_word_count prints the number of words in the text on stdin, ignoring
# fenced code blocks (``` … ```), so a curl block does not count as prose.
prose_word_count() {
  awk 'BEGIN { fence = 0 }
       /^[[:space:]]*```/ { fence = !fence; next }
       !fence { print }' | wc -w | tr -d ' '
}

# pr_diff_range prints the git range of a PR-create segment ($1, the text
# after "gh pr "): origin/<--base>...<--head>, defaulting to origin/main and
# HEAD. Honouring --base/--head keeps a stacked PR's file list to its own
# slice instead of everything since main. Shell quotes around a branch
# ("main", 'feat/x') are stripped so the refs resolve.
pr_diff_range() {
  local base=main head=HEAD
  [[ "$1" =~ (--base|-B)[[:space:]=]+([^[:space:]\;\&\|]+) ]] && base="$(unquote "${BASH_REMATCH[2]}")"
  [[ "$1" =~ (--head|-H)[[:space:]=]+([^[:space:]\;\&\|]+) ]] && head="origin/$(unquote "${BASH_REMATCH[2]}")"
  echo "origin/$base...$head"
}

# unquote prints $1 without the shell quote characters around or inside it.
unquote() {
  local v="${1//\"/}"
  echo "${v//\'/}"
}

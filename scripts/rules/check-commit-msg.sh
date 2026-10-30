#!/usr/bin/env bash
# check-commit-msg.sh <message-file> — the commit-msg rules from CLAUDE.md:
# gitmoji prefix, subject ≤ 50 characters after the emoji, no AI attribution.
# Run by the commit-msg git hook (.pre-commit-config.yaml) for every commit.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

msg_file="$1"
subject=$(/usr/bin/grep -v '^#' "$msg_file" | head -n1 || true)

# Messages git writes itself are left alone.
case "$subject" in
  Merge\ * | Revert\ * | fixup!* | squash!* | amend!*) exit 0 ;;
esac

fail() {
  echo "commit-msg: $1" >&2
  echo "  subject: $subject" >&2
  exit 1
}

if /usr/bin/grep -v '^#' "$msg_file" | has_ai_attribution; then
  fail "remove the AI attribution line (Co-Authored-By: Claude / Generated with Claude Code)"
fi
if ! starts_with_gitmoji "$subject"; then
  fail "start the subject with a gitmoji, e.g. '✨ Add …' or '🐛 Fix …'"
fi
rest=$(after_gitmoji "$subject")
len=$(char_count "$rest")
if (( len > 50 )); then
  fail "subject is $len characters after the emoji; keep it ≤ 50"
fi
if [[ -z "$rest" || "$rest" == "$subject" ]]; then
  fail "put a space and a summary after the gitmoji"
fi

#!/usr/bin/env bash
set -euo pipefail

# Config
HOST=sh-cp6.lax2.servername.online
PORT=21
LOCAL_DIR=dist/public
REMOTE_DIR=/public_html/games/pencilplatoon

# Loud, unmissable failure — a red banner to stderr, so a deploy error can't hide
# at the bottom of a wall of green build output.
die() {
  printf '\n\033[1;41;97m  ✗ DEPLOY FAILED  \033[0m \033[1;31m%s\033[0m\n\n' "$1" >&2
  exit 1
}

# Checks
command -v lftp >/dev/null || die "lftp not found. Install with: brew install lftp"
[ -d "$LOCAL_DIR" ] || die "Local dir not found: $LOCAL_DIR (run 'npm run build' first)"
[ -f "$HOME/.netrc" ] || die "~/.netrc missing — lftp reads the FTP login/password from it. Create it (chmod 600) with a 'machine $HOST' entry."

# Enable DRY_RUN=1 to preview without uploading
DRY_FLAG=""
[ "${DRY_RUN:-0}" = "1" ] && DRY_FLAG="--dry-run"

# cmd:fail-exit makes lftp abort (non-zero) on the first failed command, so a
# connection/auth/transfer error propagates instead of exiting 0.
lftp -p "$PORT" "$HOST" -e "
set cmd:fail-exit true
mirror -R --delete --parallel=4 $DRY_FLAG $LOCAL_DIR $REMOTE_DIR
bye
" || die "lftp upload to $HOST failed (connection, auth, or transfer error)"

if [ "${DRY_RUN:-0}" = "1" ]; then
  printf '\n\033[1;44;97m  ✓ DRY RUN OK  \033[0m nothing uploaded; the above is what would sync.\n\n'
else
  printf '\n\033[1;42;97m  ✓ PUBLISHED  \033[0m %s → %s:%s\n\n' "$LOCAL_DIR" "$HOST" "$REMOTE_DIR"
fi

#!/usr/bin/env bash
set -euo pipefail

# Config
HOST=s119.servername.online
PORT=21
LOCAL_DIR=dist/public
REMOTE_DIR=/public_html/games/pencilplatoon

# Checks
command -v lftp >/dev/null || { echo "lftp not found. Install with: brew install lftp"; exit 1; }
[ -d "$LOCAL_DIR" ] || { echo "Local dir not found: $LOCAL_DIR"; exit 1; }
[ -f "$HOME/.netrc" ] || { echo "~/.netrc missing"; exit 1; }

# Enable DRY_RUN=1 to preview without uploading
DRY_FLAG=""
[ "${DRY_RUN:-0}" = "1" ] && DRY_FLAG="--dry-run"

lftp -p "$PORT" "$HOST" -e "
mirror -R --delete --parallel=4 $DRY_FLAG $LOCAL_DIR $REMOTE_DIR
bye
"

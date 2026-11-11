#!/usr/bin/env bash
#
# Pushes production environment variables to Vercel from a local file, without any
# value being printed, logged or pasted anywhere.
#
# Values travel from the file into the Vercel CLI on stdin. Nothing echoes them, so
# they do not end up in a terminal scrollback, a chat transcript or a shell history.
#
# Usage:
#   npx vercel login            # once; opens a browser
#   npx vercel link --project saip-board --yes
#   scripts/push-env.sh <env-file> [environment]
#
# The env file is KEY=value lines. Blank lines and # comments are skipped, as are
# DEV_* keys and anything in SKIP below: development conveniences must never reach
# production, and password sign-in is additionally hard-gated on NODE_ENV.
set -euo pipefail

FILE="${1:?usage: scripts/push-env.sh <env-file> [environment]}"
ENVIRONMENT="${2:-production}"

SKIP="DEV_LOGIN DEV_PRESIDENT_PASSWORD UPLOAD_DIR SEED_PRESIDENT_EMAIL BETTER_AUTH_URL"

[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

pushed=0
skipped=0

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  [ "$key" = "$line" ] && continue      # no '=' on the line
  [ -n "$value" ] || { echo "  skip  $key (empty)"; skipped=$((skipped+1)); continue; }

  case " $SKIP " in *" $key "*)
    echo "  skip  $key (not for production)"; skipped=$((skipped+1)); continue ;;
  esac
  case "$key" in DEV_*)
    echo "  skip  $key (development only)"; skipped=$((skipped+1)); continue ;;
  esac

  # Replace rather than duplicate. A missing variable makes rm fail; that is fine.
  npx --yes vercel env rm "$key" "$ENVIRONMENT" --yes > /dev/null 2>&1 || true
  printf '%s' "$value" | npx --yes vercel env add "$key" "$ENVIRONMENT" > /dev/null
  echo "  set   $key  (${#value} characters)"
  pushed=$((pushed+1))
done < "$FILE"

echo
echo "$pushed set, $skipped skipped, in $ENVIRONMENT."
echo "Values were never printed. Check them in the Vercel dashboard if you want to."

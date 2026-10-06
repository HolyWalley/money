#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

export HEY_NONINTERACTIVE=1

hey auth refresh >/dev/null
token=$(hey auth token --stored)

printf '%s' "$token" | npx wrangler secret put HEY_TOKEN

# Local dev reads the same token from .dev.vars; the refresh above may have
# retired the one it held.
rest=""
if [ -f .dev.vars ]; then
  rest=$(grep -v '^HEY_TOKEN=' .dev.vars || true)
fi
umask 077
{
  if [ -n "$rest" ]; then printf '%s\n' "$rest"; fi
  printf 'HEY_TOKEN=%s\n' "$token"
} > .dev.vars

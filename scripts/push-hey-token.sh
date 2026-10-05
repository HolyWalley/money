#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

export HEY_NONINTERACTIVE=1

hey auth refresh >/dev/null
hey auth token --stored | npx wrangler secret put HEY_TOKEN

#!/bin/sh
set -eu

# Delivers a saved email to the local dev server the way Email Routing would:
#   npm run dev:mail -- <inbox address> path/to/message.eml
if [ $# -ne 2 ]; then
  echo "usage: npm run dev:mail -- <inbox address> <message.eml>" >&2
  exit 1
fi

to=$1
file=$2
from=$(sed -n 's/^From:.*<\(.*\)>.*/\1/p' "$file" | head -n 1)

curl -sk -X POST "${DEV_URL:-https://localhost:5173}/cdn-cgi/local/email" \
  --url-query "from=${from:-sender@example.com}" \
  --url-query "to=$to" \
  --data-binary "@$file"
echo

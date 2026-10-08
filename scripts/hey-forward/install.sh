#!/bin/sh
set -eu

# Runs the HEY forwarder every few minutes as a launchd agent. launchd rather
# than cron: an agent runs in the login session, where the HEY CLI can read
# its credentials from the keychain.
#
#   scripts/hey-forward/install.sh <inbox address> [interval in seconds]
#   scripts/hey-forward/install.sh --uninstall

LABEL=money.hey-forward
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/money-hey-forward.log"
DOMAIN="gui/$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled $LABEL"
  exit 0
fi

if [ $# -lt 1 ]; then
  echo "usage: $0 <inbox address> [interval in seconds] | --uninstall" >&2
  exit 1
fi

inbox=$1
interval=${2:-600}
script="$(cd "$(dirname "$0")" && pwd)/forward.ts"
# A version manager's shim needs its own shell setup, which launchd does not give it.
node=$( (asdf which node 2>/dev/null) || command -v node)
hey_dir=$(dirname "$(command -v hey)")

mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node</string>
    <string>$script</string>
    <string>$inbox</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$hey_dir:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key><integer>$interval</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL: every ${interval}s, logging to $LOG"

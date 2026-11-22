#!/usr/bin/env bash
# Usage: scripts/smoke-test.sh <learning-url> <projects-url> <ui-url>
#
# Checks the deployed system end to end, the way a browser uses it. Read-only:
# it never writes data, so it is safe to run against production after every deploy.
set -euo pipefail

learning="${1:?learning url required}"
projects="${2:?projects url required}"
ui="${3:?ui url required}"
failures=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "ok   $name"
  else
    echo "FAIL $name"
    failures=$((failures + 1))
  fi
}

status_of() { curl --silent --output /dev/null --max-time 60 --write-out '%{http_code}' "$@"; }

# Both databases answer (this also wakes them if they were paused).
db_ok() { [ "$(status_of "$1/health/db")" = "200" ]; }

# The catalogue is readable without a demo user and returns JSON with items.
catalogue_ok() { curl --silent --fail --max-time 60 "$learning/courses" | grep -q '"items"'; }

# The UI is served, and deep links fall back to index.html.
ui_ok() { [ "$(status_of "$ui/")" = "200" ] && [ "$(status_of "$ui/courses")" = "200" ]; }

# The deployed config.js points the browser at these services.
config_ok() { curl --silent --fail --max-time 30 "$ui/config.js" | grep -q "$learning"; }

# A browser preflight for a JSON POST from the UI's origin is allowed by the
# service itself (CORS must not be configured on the Container Apps ingress).
preflight_ok() {
  curl --silent --include --max-time 30 --request OPTIONS "$1/courses" \
    --header "Origin: $ui" \
    --header 'Access-Control-Request-Method: POST' \
    --header 'Access-Control-Request-Headers: content-type,x-demo-user' |
    tr -d '\r' | grep -qi "^access-control-allow-origin: $ui$"
}

# Any other origin is not allowed.
foreign_origin_blocked() {
  ! curl --silent --include --max-time 30 "$learning/health" --header 'Origin: https://example.com' |
    tr -d '\r' | grep -qi '^access-control-allow-origin: https://example.com'
}

check "learning database" db_ok "$learning"
check "projects database" db_ok "$projects"
check "course catalogue" catalogue_ok
check "UI and deep links" ui_ok
check "UI config points at learning" config_ok
check "CORS preflight to learning" preflight_ok "$learning"
check "CORS preflight to projects" preflight_ok "$projects"
check "other origins blocked" foreign_origin_blocked

if [ "$failures" -gt 0 ]; then
  echo "::error::$failures smoke check(s) failed"
  exit 1
fi
echo "all smoke checks passed"

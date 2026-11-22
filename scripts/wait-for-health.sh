#!/usr/bin/env bash
# Usage: scripts/wait-for-health.sh <service-url> [expected-version]
#
# Polls <service-url>/health until it returns 200 (and, if given, reports the
# expected version), or fails after TIMEOUT_SECONDS. A cold start can take a few
# minutes: the container starts from zero, then waits for Azure SQL to resume.
set -euo pipefail

url="${1:?service url required}"
expected="${2:-}"
timeout="${TIMEOUT_SECONDS:-420}"
interval="${INTERVAL_SECONDS:-10}"
deadline=$((SECONDS + timeout))

while true; do
  body=$(curl --silent --max-time 30 --write-out '\n%{http_code}' "$url/health" 2>/dev/null || true)
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"

  if [ "$status" = "200" ]; then
    if [ -z "$expected" ] || grep -q "\"version\":\"$expected\"" <<<"$body"; then
      echo "healthy: $url $body"
      exit 0
    fi
    echo "up, but still the previous version: $body"
  else
    echo "not ready yet ($status): $url/health"
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "::error::$url/health did not return 200 with version '${expected:-any}' within ${timeout}s"
    exit 1
  fi
  sleep "$interval"
done

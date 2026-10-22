#!/usr/bin/env bash
# CI's audit (.github/workflows/ci.yml): known vulnerabilities rated high or
# critical in the packages the site runs on, read from the lockfile.
# npm's audit service sometimes fails to answer (HTTP 503 "Service
# Unavailable"), which says nothing about the dependencies, so a run that
# produced no audit report is tried again, up to three times, a minute apart.
# A report that finds vulnerabilities fails at once and is never retried.
set -u

attempts=${AUDIT_ATTEMPTS:-3}
delay=${AUDIT_RETRY_DELAY:-60}
out=$(mktemp)
trap 'rm -f "$out"' EXIT

for attempt in $(seq 1 "$attempts"); do
  if npm audit --omit=dev --audit-level=high --package-lock-only >"$out" 2>&1; then
    cat "$out"
    exit 0
  fi
  cat "$out"
  # A report: npm's heading, or its summary ("2 high severity
  # vulnerabilities", "3 vulnerabilities (1 moderate, 2 high)")
  if grep -Eq '^# npm audit report|[0-9]+ ([a-z]+ severity )?vulnerabilit' "$out"; then
    exit 1
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "::warning::npm's audit service did not answer (attempt $attempt of $attempts); trying again in ${delay}s"
    sleep "$delay"
  fi
done

echo "::error::npm's audit service did not answer after $attempts attempts; this is not a finding about the dependencies"
exit 1

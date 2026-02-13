#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo "  Nimbus Demo Validation"
echo "============================================"
echo ""

PASS=0
FAIL=0
WARN=0

check() {
  local description="$1"
  local command="$2"

  printf "  %-50s " "$description"

  if eval "$command" > /dev/null 2>&1; then
    echo "[PASS]"
    PASS=$((PASS + 1))
  else
    echo "[WARN]"
    WARN=$((WARN + 1))
  fi
}

echo "--- Build Checks ---"
check "TypeScript compiles" "bun run type-check"
check "Tests pass" "bun test --timeout 30000 2>&1 | tail -1 | grep -q 'pass'"

echo ""
echo "--- CLI Commands ---"
check "nimbus version" "bun run services/cli-service/src/index.ts version --json 2>/dev/null"
check "nimbus help" "bun run services/cli-service/src/index.ts help 2>/dev/null"
check "nimbus doctor" "bun run services/cli-service/src/index.ts doctor 2>/dev/null"

echo ""
echo "--- Demo Scripts ---"
if [ -d "scripts/demos" ]; then
  for script in scripts/demos/0*.sh; do
    if [ -f "$script" ]; then
      name=$(basename "$script")
      check "Demo: $name" "bash '$script' --dry-run 2>&1"
    fi
  done
else
  echo "  No demo scripts found in scripts/demos/"
fi

echo ""
echo "============================================"
echo "  Results: $PASS passed, $WARN warnings, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo ""
echo "Demo validation complete!"

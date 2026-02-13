#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo "  Nimbus Performance Benchmark"
echo "============================================"
echo ""

# Benchmark CLI startup time
echo "--- CLI Startup Times ---"
echo ""

echo -n "  version command:  "
START=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
bun run services/cli-service/src/index.ts version --json > /dev/null 2>&1 || true
END=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
ELAPSED=$(( (END - START) / 1000000 ))
echo "${ELAPSED}ms"

echo -n "  help command:     "
START=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
bun run services/cli-service/src/index.ts help > /dev/null 2>&1 || true
END=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
ELAPSED=$(( (END - START) / 1000000 ))
echo "${ELAPSED}ms"

echo -n "  doctor command:   "
START=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
bun run services/cli-service/src/index.ts doctor > /dev/null 2>&1 || true
END=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
ELAPSED=$(( (END - START) / 1000000 ))
echo "${ELAPSED}ms"

echo ""
echo "--- Test Suite Performance ---"
echo ""

echo -n "  Full test suite:  "
START=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
bun test --timeout 60000 > /dev/null 2>&1 || true
END=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000000000))')
ELAPSED=$(( (END - START) / 1000000 ))
echo "${ELAPSED}ms"

echo ""
echo "============================================"
echo "  Benchmark complete"
echo "============================================"

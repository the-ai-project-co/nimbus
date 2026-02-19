#!/usr/bin/env bash
#
# validate-demo.sh -- Pre-demo validation script for Nimbus MVP
#
# Runs a series of checks to confirm the platform is ready for an
# investor / stakeholder demo.  Exits 0 only if every critical
# check passes; non-critical failures are reported as warnings.
#
set -euo pipefail

# -- Colours --------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# -- Counters -------------------------------------------------------
PASS=0
FAIL=0
WARN=0

pass()  { PASS=$((PASS + 1)); echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail()  { FAIL=$((FAIL + 1)); echo -e "  ${RED}[FAIL]${NC} $1"; }
warn()  { WARN=$((WARN + 1)); echo -e "  ${YELLOW}[WARN]${NC} $1"; }

# -- Header ---------------------------------------------------------
echo ""
echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}   Nimbus Demo Validation Suite${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""

# -------------------------------------------------------------------
# 1. Service Health Checks
# -------------------------------------------------------------------
echo -e "${CYAN}--- Service Health Checks ---${NC}"

SERVICES=(
  "CLI Service:3000"
  "Core Engine:3001"
  "LLM Service:3002"
  "Generator:3003"
  "Git Tools:3004"
  "FS Tools:3005"
  "Terraform Tools:3006"
  "K8s Tools:3007"
  "Helm Tools:3008"
  "AWS Tools:3009"
  "GitHub Tools:3010"
  "State Service:3011"
)

for entry in "${SERVICES[@]}"; do
  IFS=':' read -r name port <<< "$entry"
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/health" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    pass "$name (port $port) is healthy"
  else
    fail "$name (port $port) returned HTTP $status"
  fi
done

echo ""

# -------------------------------------------------------------------
# 2. CLI Smoke Test
# -------------------------------------------------------------------
echo -e "${CYAN}--- CLI Smoke Test ---${NC}"

# Try nimbus binary first, then fall back to bun-run of server source.
if command -v nimbus &>/dev/null; then
  if nimbus --help &>/dev/null; then
    pass "nimbus --help executed successfully"
  else
    fail "nimbus --help returned non-zero exit code"
  fi
  if nimbus --version &>/dev/null; then
    pass "nimbus --version executed successfully"
  else
    warn "nimbus --version returned non-zero (may be expected without full env)"
  fi
elif [ -f "services/cli-service/src/server.ts" ]; then
  if bun run services/cli-service/src/server.ts --help >/dev/null 2>&1; then
    pass "CLI server.ts --help executed successfully"
  else
    warn "CLI --help returned non-zero (may be expected without full env)"
  fi
else
  warn "nimbus binary not found and CLI source missing -- skipping CLI test"
fi

echo ""

# -------------------------------------------------------------------
# 3. Key API Endpoint Validation
# -------------------------------------------------------------------
echo -e "${CYAN}--- API Endpoint Validation ---${NC}"

check_endpoint() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"

  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$status" = "$expected_status" ]; then
    pass "$label -> HTTP $status"
  else
    fail "$label -> HTTP $status (expected $expected_status)"
  fi
}

# Core endpoints that must work during a demo
check_endpoint "Core Engine /health"       "http://localhost:3001/health"
check_endpoint "LLM Service /models"       "http://localhost:3002/models"
check_endpoint "Generator /health"         "http://localhost:3003/health"
check_endpoint "State Service /health"     "http://localhost:3011/health"
check_endpoint "Git Tools /health"         "http://localhost:3004/health"
check_endpoint "FS Tools /health"          "http://localhost:3005/health"
check_endpoint "Terraform Tools /health"   "http://localhost:3006/health"
check_endpoint "K8s Tools /health"         "http://localhost:3007/health"
check_endpoint "AWS Tools /health"         "http://localhost:3009/health"
check_endpoint "GitHub Tools /health"      "http://localhost:3010/health"

echo ""

# -------------------------------------------------------------------
# 4. Response Body Validation
# -------------------------------------------------------------------
echo -e "${CYAN}--- Response Body Validation ---${NC}"

# Verify health responses contain the expected JSON structure.
CORE_BODY=$(curl -s "http://localhost:3001/health" 2>/dev/null || echo "{}")
if echo "$CORE_BODY" | grep -q '"status"'; then
  pass "Core Engine health returns JSON with status field"
else
  fail "Core Engine health response missing status field"
fi

STATE_BODY=$(curl -s "http://localhost:3011/health" 2>/dev/null || echo "{}")
if echo "$STATE_BODY" | grep -q '"status"'; then
  pass "State Service health returns JSON with status field"
else
  fail "State Service health response missing status field"
fi

LLM_BODY=$(curl -s "http://localhost:3002/health" 2>/dev/null || echo "{}")
if echo "$LLM_BODY" | grep -q '"status"'; then
  pass "LLM Service health returns JSON with status field"
else
  fail "LLM Service health response missing status field"
fi

echo ""

# -------------------------------------------------------------------
# 5. Build Checks (non-critical)
# -------------------------------------------------------------------
echo -e "${CYAN}--- Build Checks ---${NC}"

if bun run type-check > /dev/null 2>&1; then
  pass "TypeScript compiles successfully"
else
  warn "TypeScript compilation had errors (non-blocking)"
fi

echo ""

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}   Validation Summary${NC}"
echo -e "${CYAN}=========================================${NC}"
echo -e "  ${GREEN}Passed  : $PASS${NC}"
echo -e "  ${RED}Failed  : $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All critical checks passed. Demo is GO.${NC}"
  exit 0
else
  echo -e "${RED}$FAIL check(s) failed. Review output above before demo.${NC}"
  exit 1
fi

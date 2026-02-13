#!/usr/bin/env bash
#
# Nimbus Demo Environment Setup
# Sets up environment variables and checks prerequisites for demo mode.
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
  echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
  echo -e "${CYAN}  Nimbus Demo Environment Setup${NC}"
  echo -e "${CYAN}═══════════════════════════════════════${NC}\n"
}

print_status() {
  local status=$1
  local name=$2
  if [ "$status" = "ok" ]; then
    echo -e "  ${GREEN}✓${NC} $name"
  elif [ "$status" = "warn" ]; then
    echo -e "  ${YELLOW}⚠${NC} $name"
  else
    echo -e "  ${RED}✗${NC} $name"
  fi
}

check_command() {
  local cmd=$1
  local name=${2:-$cmd}
  if command -v "$cmd" &>/dev/null; then
    print_status "ok" "$name found: $(command -v "$cmd")"
    return 0
  else
    print_status "fail" "$name not found"
    return 1
  fi
}

check_service_health() {
  local url=$1
  local name=$2
  if curl -sf "$url" &>/dev/null; then
    print_status "ok" "$name is healthy"
    return 0
  else
    print_status "warn" "$name is not responding"
    return 1
  fi
}

print_header

# Check prerequisites
echo -e "${CYAN}Checking prerequisites...${NC}"
MISSING=0
check_command "terraform" "Terraform" || MISSING=$((MISSING + 1))
check_command "kubectl" "kubectl" || MISSING=$((MISSING + 1))
check_command "helm" "Helm" || MISSING=$((MISSING + 1))
check_command "aws" "AWS CLI" || MISSING=$((MISSING + 1))

if [ "$MISSING" -gt 0 ]; then
  echo -e "\n${YELLOW}Warning: $MISSING prerequisite(s) missing. Some demos may not work.${NC}"
fi

# Set environment variables
echo -e "\n${CYAN}Setting environment variables...${NC}"
export NIMBUS_DEMO_MODE=true
export NIMBUS_DRY_RUN=true
print_status "ok" "NIMBUS_DEMO_MODE=true"
print_status "ok" "NIMBUS_DRY_RUN=true"

# Create/clean demo directory
DEMO_DIR="$HOME/.nimbus/demo"
echo -e "\n${CYAN}Setting up demo directory...${NC}"
if [ -d "$DEMO_DIR" ]; then
  rm -rf "$DEMO_DIR"
  print_status "ok" "Cleaned existing demo directory"
fi
mkdir -p "$DEMO_DIR"
print_status "ok" "Created $DEMO_DIR"

# Check service health
echo -e "\n${CYAN}Checking service health...${NC}"
SERVICES_UP=0
SERVICES_TOTAL=0

services=(
  "http://localhost:3001/health Core-Engine"
  "http://localhost:3002/health LLM-Service"
  "http://localhost:3003/health Generator"
  "http://localhost:3004/health State-Service"
  "http://localhost:3005/health Terraform-Tools"
  "http://localhost:3006/health K8s-Tools"
  "http://localhost:3007/health Helm-Tools"
  "http://localhost:3008/health Git-Tools"
  "http://localhost:3009/health GitHub-Tools"
  "http://localhost:3010/health AWS-Tools"
  "http://localhost:3011/health FS-Tools"
  "http://localhost:3012/health Audit-Service"
)

for entry in "${services[@]}"; do
  url=$(echo "$entry" | awk '{print $1}')
  name=$(echo "$entry" | awk '{print $2}')
  SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
  if check_service_health "$url" "$name"; then
    SERVICES_UP=$((SERVICES_UP + 1))
  fi
done

# Print summary
echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "  Prerequisites: $((4 - MISSING))/4 found"
echo -e "  Services: $SERVICES_UP/$SERVICES_TOTAL healthy"
echo -e "  Demo directory: $DEMO_DIR"
echo -e "  Demo mode: ${GREEN}enabled${NC}"
echo -e "  Dry run: ${GREEN}enabled${NC}"

if [ "$SERVICES_UP" -eq 0 ]; then
  echo -e "\n${YELLOW}No services are running. Start services with:${NC}"
  echo -e "  cd docker && docker compose up -d"
fi

echo -e "\n${GREEN}Demo environment ready!${NC}"
echo -e "Run: ${CYAN}nimbus demo --list${NC} to see available scenarios.\n"

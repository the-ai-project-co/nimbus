#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

services=(
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

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Checking health of all Nimbus services...        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

healthy=0
unhealthy=0

for service_port in "${services[@]}"; do
  IFS=':' read -r service port <<< "$service_port"

  # Check health endpoint
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health 2>/dev/null)

  if [ "$status" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} $service (port $port): ${GREEN}healthy${NC}"
    ((healthy++))
  else
    echo -e "  ${RED}✗${NC} $service (port $port): ${RED}unhealthy${NC} (HTTP $status)"
    ((unhealthy++))
  fi
done

echo ""
echo -e "${YELLOW}Summary:${NC} ${GREEN}$healthy healthy${NC}, ${RED}$unhealthy unhealthy${NC}"

if [ $unhealthy -eq 0 ]; then
  echo -e "${GREEN}All services are healthy!${NC}"
  exit 0
else
  echo -e "${RED}Some services are unhealthy. Check logs for details.${NC}"
  exit 1
fi

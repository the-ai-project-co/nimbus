#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Starting all Nimbus services...                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create logs directory if it doesn't exist
mkdir -p logs

# Array of services with their ports (in dependency order)
services=(
  "state-service:3011"
  "llm-service:3002"
  "core-engine-service:3001"
  "generator-service:3003"
  "git-tools-service:3004"
  "fs-tools-service:3005"
  "terraform-tools-service:3006"
  "k8s-tools-service:3007"
  "helm-tools-service:3008"
  "aws-tools-service:3009"
  "github-tools-service:3010"
  "cli-service:3000"
)

# Track PIDs for cleanup
pids=()

# Cleanup function
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping all services...${NC}"
  for pid in "${pids[@]}"; do
    kill $pid 2>/dev/null
  done
  echo -e "${GREEN}All services stopped${NC}"
  exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Start each service in background
for service_port in "${services[@]}"; do
  IFS=':' read -r service port <<< "$service_port"
  echo -e "${YELLOW}▶  Starting $service on port $port...${NC}"

  cd "services/$service" || exit 1
  PORT=$port bun dev > "../../logs/$service.log" 2>&1 &
  pid=$!
  pids+=($pid)
  cd ../.. || exit 1

  # Small delay to avoid port conflicts
  sleep 0.5
done

echo ""
echo -e "${GREEN}✓ All services started!${NC}"
echo ""
echo -e "${YELLOW}Service Status:${NC}"
echo -e "  Run: ${GREEN}./scripts/check-health.sh${NC} to verify"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  View logs in: ${GREEN}logs/${NC} directory"
echo ""
echo -e "${RED}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for all processes
wait

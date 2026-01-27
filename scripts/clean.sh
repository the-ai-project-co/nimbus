#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Cleaning Nimbus workspace...${NC}"

# Remove node_modules
echo -e "${YELLOW}Removing node_modules...${NC}"
rm -rf node_modules
find services -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null
find shared -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null

# Remove build artifacts
echo -e "${YELLOW}Removing build artifacts...${NC}"
find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null
rm -rf coverage
rm -rf .bun-cache

# Remove logs
echo -e "${YELLOW}Removing logs...${NC}"
rm -rf logs
mkdir -p logs

# Ask about database
read -p "Do you want to remove the database? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Removing database...${NC}"
  rm -f services/state-service/data/*.db
  echo -e "${GREEN}✓ Database removed${NC}"
else
  echo -e "${YELLOW}Database preserved${NC}"
fi

echo ""
echo -e "${GREEN}✓ Cleanup complete!${NC}"
echo -e "${YELLOW}Run './scripts/dev-setup.sh' to reinstall${NC}"

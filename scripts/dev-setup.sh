#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Nimbus Development Environment Setup             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for Bun
echo -e "${YELLOW}1. Checking for Bun...${NC}"
if ! command -v bun &> /dev/null; then
  echo -e "${RED}   Bun is not installed!${NC}"
  echo -e "   Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo -e "${GREEN}   ✓ Bun installed${NC}"
else
  echo -e "${GREEN}   ✓ Bun is installed ($(bun --version))${NC}"
fi

# Install dependencies
echo ""
echo -e "${YELLOW}2. Installing dependencies...${NC}"
bun install
echo -e "${GREEN}   ✓ Dependencies installed${NC}"

# Create .env files
echo ""
echo -e "${YELLOW}3. Creating .env files...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${GREEN}   ✓ Created root .env file${NC}"
else
  echo -e "${YELLOW}   .env file already exists${NC}"
fi

for service in services/*/; do
  if [ -f "${service}.env.example" ]; then
    if [ ! -f "${service}.env" ]; then
      cp "${service}.env.example" "${service}.env"
      service_name=$(basename "$service")
      echo -e "${GREEN}   ✓ Created .env for $service_name${NC}"
    fi
  fi
done

# Create necessary directories
echo ""
echo -e "${YELLOW}4. Creating directories...${NC}"
mkdir -p logs
mkdir -p services/state-service/data
echo -e "${GREEN}   ✓ Directories created${NC}"

# Initialize database
echo ""
echo -e "${YELLOW}5. Initializing State Service database...${NC}"
cd services/state-service
bun src/db/init.ts
cd ../..
echo -e "${GREEN}   ✓ Database initialized${NC}"

# Make scripts executable
echo ""
echo -e "${YELLOW}6. Making scripts executable...${NC}"
chmod +x scripts/*.sh
chmod +x scripts/*.ts
echo -e "${GREEN}   ✓ Scripts are executable${NC}"

# Link CLI binary (optional)
echo ""
echo -e "${YELLOW}7. Linking CLI binary (optional)...${NC}"
read -p "   Do you want to install 'nimbus' command globally? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd services/cli-service
  bun link
  cd ../..
  echo -e "${GREEN}   ✓ CLI binary linked (use 'nimbus' command)${NC}"
else
  echo -e "${YELLOW}   Skipped CLI binary linking${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 Setup Complete!                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Review and update .env files with your API keys"
echo -e "  2. Run ${GREEN}bun dev${NC} to start all services"
echo -e "  3. Run ${GREEN}./scripts/check-health.sh${NC} to verify"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  ${GREEN}bun dev${NC}                   - Start all services"
echo -e "  ${GREEN}./scripts/check-health.sh${NC} - Check service health"
echo -e "  ${GREEN}bun test${NC}                  - Run tests"
echo -e "  ${GREEN}nimbus --help${NC}             - CLI help (if linked)"
echo ""

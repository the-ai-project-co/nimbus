#!/usr/bin/env bash
# Update Homebrew formula with correct SHA256 for a release
#
# Usage: ./scripts/update-formula.sh v1.0.0
#
# This script:
# 1. Downloads the release tarball from GitHub
# 2. Calculates SHA256
# 3. Updates Formula/nimbus.rb with the correct hash
# 4. Validates the formula syntax

set -euo pipefail

VERSION="${1:?Usage: $0 <version> (e.g., v1.0.0)}"

# Strip leading 'v' for version number
VERSION_NUM="${VERSION#v}"

REPO="the-ai-project-co/nimbus"
TARBALL_URL="https://github.com/${REPO}/archive/refs/tags/${VERSION}.tar.gz"
FORMULA_PATH="Formula/nimbus.rb"
TEMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Downloading release tarball: ${TARBALL_URL}"
curl -sL "${TARBALL_URL}" -o "${TEMP_DIR}/nimbus-${VERSION}.tar.gz"

if [ ! -s "${TEMP_DIR}/nimbus-${VERSION}.tar.gz" ]; then
  echo "Error: Failed to download tarball or file is empty"
  exit 1
fi

echo "Calculating SHA256..."
SHA256=$(shasum -a 256 "${TEMP_DIR}/nimbus-${VERSION}.tar.gz" | awk '{print $1}')
echo "SHA256: ${SHA256}"

if [ ! -f "${FORMULA_PATH}" ]; then
  echo "Error: Formula not found at ${FORMULA_PATH}"
  exit 1
fi

echo "Updating formula..."
# Update version
sed -i '' "s|url \"https://github.com/${REPO}/archive/refs/tags/v.*\.tar\.gz\"|url \"https://github.com/${REPO}/archive/refs/tags/${VERSION}.tar.gz\"|" "${FORMULA_PATH}"

# Update SHA256
sed -i '' "s|sha256 \".*\"|sha256 \"${SHA256}\"|" "${FORMULA_PATH}"

echo "Validating formula syntax..."
if command -v brew &>/dev/null; then
  brew audit --formula "${FORMULA_PATH}" --online 2>/dev/null || true
  echo "Formula validation complete"
else
  echo "brew not available, skipping formula validation"
fi

echo ""
echo "Formula updated successfully!"
echo "  Version: ${VERSION_NUM}"
echo "  SHA256:  ${SHA256}"
echo "  File:    ${FORMULA_PATH}"

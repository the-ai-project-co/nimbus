#!/usr/bin/env bash
set -euo pipefail

# Build Nimbus CLI as a standalone binary using Bun
# Usage: ./scripts/build-binary.sh [target]
# Targets: linux-x64, darwin-arm64, darwin-x64, all (default: current platform)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY="$ROOT_DIR/services/cli-service/src/index.ts"
DIST_DIR="$ROOT_DIR/dist"

mkdir -p "$DIST_DIR"

TARGET="${1:-current}"

build_for_target() {
  local target="$1"
  local outfile="$2"
  echo "Building nimbus for $target..."
  bun build "$ENTRY" --compile --target="bun-$target" --outfile "$outfile"
  chmod +x "$outfile"
  echo "  -> $outfile ($(du -h "$outfile" | cut -f1))"
}

case "$TARGET" in
  linux-x64)
    build_for_target "linux-x64" "$DIST_DIR/nimbus-linux-x64"
    ;;
  darwin-arm64)
    build_for_target "darwin-arm64" "$DIST_DIR/nimbus-darwin-arm64"
    ;;
  darwin-x64)
    build_for_target "darwin-x64" "$DIST_DIR/nimbus-darwin-x64"
    ;;
  all)
    build_for_target "linux-x64" "$DIST_DIR/nimbus-linux-x64"
    build_for_target "darwin-arm64" "$DIST_DIR/nimbus-darwin-arm64"
    build_for_target "darwin-x64" "$DIST_DIR/nimbus-darwin-x64"
    ;;
  current|*)
    echo "Building nimbus for current platform..."
    bun build "$ENTRY" --compile --outfile "$DIST_DIR/nimbus"
    chmod +x "$DIST_DIR/nimbus"
    echo "  -> $DIST_DIR/nimbus ($(du -h "$DIST_DIR/nimbus" | cut -f1))"
    ;;
esac

echo "Build complete!"

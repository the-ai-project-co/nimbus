#!/usr/bin/env bash
set -euo pipefail

# Build Nimbus CLI as a standalone binary using Bun
# Usage: ./scripts/build-binary.sh [target]
# Targets: linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64, all (default: current platform)
#
# For platform targets, a .tar.gz tarball is also created alongside the binary.
# The tarball contains only the binary renamed to "nimbus" so that Homebrew's
# `bin.install "nimbus"` works without extra logic.
#
# For Windows targets, a .zip archive is created instead of a tarball.
#
# After building, a checksums.txt file is written to dist/ containing SHA256
# hashes for all generated tarballs/archives.  When building individual targets,
# existing checksums for other platforms are preserved; when building "all" or
# "current", the checksums file is reset.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY="$ROOT_DIR/services/cli-service/src/index.ts"
DIST_DIR="$ROOT_DIR/dist"

mkdir -p "$DIST_DIR"

CHECKSUMS_FILE="$DIST_DIR/checksums.txt"

TARGET="${1:-current}"

# Packages that must be excluded from the standalone bundle.
# ink (React-based terminal UI) uses top-level await and react-devtools-core
# which cannot be statically compiled. The CLI provides graceful fallbacks
# when these packages are unavailable at runtime, so excluding them is safe.
EXTERNALS=(
  --external react-devtools-core
  --external ink
  --external ink-text-input
  --external ink-spinner
  --external ink-select-input
  --external react
)

build_for_target() {
  local target="$1"
  local outfile="$2"
  echo "Building nimbus for $target..."
  bun build "$ENTRY" --compile --target="bun-$target" --outfile "$outfile" "${EXTERNALS[@]}"
  chmod +x "$outfile"
  echo "  -> $outfile ($(du -h "$outfile" | cut -f1))"
}

# Append a SHA256 line to checksums.txt, replacing any existing entry for the
# same archive name.
record_checksum() {
  local archive_path="$1"
  local sha
  sha="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  local archive_name
  archive_name="$(basename "$archive_path")"

  # Remove previous entry for this archive (if any)
  if [ -f "$CHECKSUMS_FILE" ]; then
    local tmp
    tmp="$(mktemp)"
    grep -v "  ${archive_name}$" "$CHECKSUMS_FILE" > "$tmp" 2>/dev/null || true
    mv "$tmp" "$CHECKSUMS_FILE"
  fi

  echo "${sha}  ${archive_name}" >> "$CHECKSUMS_FILE"
  echo "  SHA256: ${sha}"
}

create_tarball() {
  local binary="$1"
  local tarball="${binary}.tar.gz"

  echo "Creating tarball: $tarball"

  # Create a temporary staging directory so the tarball contains a single
  # file named "nimbus" (without the platform suffix). This matches what
  # the Homebrew formula expects: `bin.install "nimbus"`.
  local staging
  staging="$(mktemp -d)"
  cp "$binary" "${staging}/nimbus"
  tar czf "$tarball" -C "$staging" "nimbus"
  rm -rf "$staging"

  echo "  -> $tarball ($(du -h "$tarball" | cut -f1))"
  record_checksum "$tarball"
}

create_zip() {
  local binary="$1"
  local zipfile="${binary}.zip"
  local staging
  staging="$(mktemp -d)"
  cp "$binary" "${staging}/nimbus.exe"
  (cd "$staging" && zip -q "$zipfile" "nimbus.exe")
  mv "${staging}/$(basename "$zipfile")" "$zipfile"
  rm -rf "$staging"
  echo "  -> $zipfile ($(du -h "$zipfile" | cut -f1))"
  record_checksum "$zipfile"
}

# For "all" and "current", start with a fresh checksums file.
if [ "$TARGET" = "all" ] || [ "$TARGET" = "current" ]; then
  : > "$CHECKSUMS_FILE"
fi

# Ensure checksums file exists for append operations.
touch "$CHECKSUMS_FILE"

case "$TARGET" in
  linux-x64)
    build_for_target "linux-x64" "$DIST_DIR/nimbus-linux-x64"
    create_tarball "$DIST_DIR/nimbus-linux-x64"
    ;;
  linux-arm64)
    build_for_target "linux-arm64" "$DIST_DIR/nimbus-linux-arm64"
    create_tarball "$DIST_DIR/nimbus-linux-arm64"
    ;;
  darwin-arm64)
    build_for_target "darwin-arm64" "$DIST_DIR/nimbus-darwin-arm64"
    create_tarball "$DIST_DIR/nimbus-darwin-arm64"
    ;;
  darwin-x64)
    build_for_target "darwin-x64" "$DIST_DIR/nimbus-darwin-x64"
    create_tarball "$DIST_DIR/nimbus-darwin-x64"
    ;;
  windows-x64)
    build_for_target "windows-x64" "$DIST_DIR/nimbus-windows-x64.exe"
    create_zip "$DIST_DIR/nimbus-windows-x64.exe"
    ;;
  all)
    build_for_target "darwin-arm64" "$DIST_DIR/nimbus-darwin-arm64"
    create_tarball "$DIST_DIR/nimbus-darwin-arm64"

    build_for_target "darwin-x64" "$DIST_DIR/nimbus-darwin-x64"
    create_tarball "$DIST_DIR/nimbus-darwin-x64"

    build_for_target "linux-x64" "$DIST_DIR/nimbus-linux-x64"
    create_tarball "$DIST_DIR/nimbus-linux-x64"

    build_for_target "linux-arm64" "$DIST_DIR/nimbus-linux-arm64"
    create_tarball "$DIST_DIR/nimbus-linux-arm64"

    build_for_target "windows-x64" "$DIST_DIR/nimbus-windows-x64.exe"
    create_zip "$DIST_DIR/nimbus-windows-x64.exe"
    ;;
  current|*)
    echo "Building nimbus for current platform..."
    bun build "$ENTRY" --compile --outfile "$DIST_DIR/nimbus" "${EXTERNALS[@]}"
    chmod +x "$DIST_DIR/nimbus"
    echo "  -> $DIST_DIR/nimbus ($(du -h "$DIST_DIR/nimbus" | cut -f1))"

    # Detect current platform for tarball naming
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m)"
    case "$ARCH" in
      x86_64) ARCH="x64" ;;
      aarch64|arm64) ARCH="arm64" ;;
    esac
    PLATFORM="${OS}-${ARCH}"

    # Create a platform-named copy and tarball
    cp "$DIST_DIR/nimbus" "$DIST_DIR/nimbus-${PLATFORM}"
    create_tarball "$DIST_DIR/nimbus-${PLATFORM}"
    ;;
esac

echo ""
echo "Build complete!"
if [ -s "$CHECKSUMS_FILE" ]; then
  echo ""
  echo "Checksums ($CHECKSUMS_FILE):"
  cat "$CHECKSUMS_FILE"
fi

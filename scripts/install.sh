#!/bin/bash
# Nimbus CLI Installer
# Usage: curl -fsSL https://nimbus.dev/install.sh | bash
#
# Installation methods (in priority order):
#   1. bun install -g @nimbus-ai/cli  — Full features including rich TUI
#   2. Pre-built binary       — Lighter weight, readline chat only (no Ink TUI)
#
# Environment variables:
#   NIMBUS_INSTALL_DIR     - Installation directory for binary method (default: ~/.nimbus)
#   NIMBUS_VERSION         - Specific version to install (default: latest)
#   NIMBUS_NO_MODIFY_PATH  - Set to 1 to skip PATH modification
#   NIMBUS_PREFER_BINARY   - Set to 1 to prefer pre-built binary over bun/npm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="${NIMBUS_INSTALL_DIR:-$HOME/.nimbus}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="${NIMBUS_VERSION:-latest}"
GITHUB_REPO="the-ai-project-co/nimbus"
GITHUB_URL="https://github.com/$GITHUB_REPO"

# Logging functions
info() {
    echo -e "${BLUE}INFO${NC} $1"
}

success() {
    echo -e "${GREEN}SUCCESS${NC} $1"
}

warn() {
    echo -e "${YELLOW}WARNING${NC} $1"
}

error() {
    echo -e "${RED}ERROR${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux*)
            PLATFORM="linux"
            ;;
        Darwin*)
            PLATFORM="darwin"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            PLATFORM="windows"
            ;;
        *)
            error "Unsupported operating system: $OS"
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)
            ARCH="x64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac

    info "Detected platform: $PLATFORM-$ARCH"
}

# Check for required tools
check_requirements() {
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        error "curl or wget is required but not installed"
    fi
}

# Download file using curl or wget
download() {
    local url="$1"
    local output="$2"

    if command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$output"
    elif command -v wget &> /dev/null; then
        wget -q "$url" -O "$output"
    fi
}

# Get latest version from GitHub
get_latest_version() {
    if [ "$VERSION" = "latest" ]; then
        info "Fetching latest version..."
        VERSION=$(curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
        if [ -z "$VERSION" ]; then
            VERSION="0.2.0"
            warn "Could not fetch latest version, using $VERSION"
        fi
    fi
    info "Installing version: $VERSION"
}

# Install via Bun (preferred — includes Ink TUI)
install_via_bun() {
    if ! command -v bun &> /dev/null; then
        return 1
    fi

    info "Installing Nimbus via Bun (includes rich terminal UI)..."
    if bun install -g @nimbus-ai/cli@"$VERSION" 2>/dev/null; then
        success "Nimbus installed via Bun!"
        return 0
    fi
    return 1
}

# Install via npm (fallback — includes Ink TUI)
install_via_npm() {
    if ! command -v npm &> /dev/null; then
        return 1
    fi

    info "Installing Nimbus via npm..."

    # Avoid sudo prompts — check if npm global prefix is user-writable
    local npm_prefix
    npm_prefix="$(npm config get prefix 2>/dev/null)"
    if [ -n "$npm_prefix" ] && [ ! -w "$npm_prefix/lib" ]; then
        warn "npm global directory ($npm_prefix) is not writable."
        warn "Consider using 'bun install -g' instead, or fix npm permissions:"
        warn "  https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
        return 1
    fi

    if npm install -g @nimbus-ai/cli@"$VERSION" 2>/dev/null; then
        success "Nimbus installed via npm!"
        return 0
    fi
    return 1
}

# Install Bun if not present, then install via Bun
install_bun_then_nimbus() {
    info "Bun is not installed. Installing Bun first..."
    if command -v curl &> /dev/null; then
        curl -fsSL https://bun.sh/install | bash 2>/dev/null
    else
        return 1
    fi

    # Source Bun into current shell
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if command -v bun &> /dev/null; then
        install_via_bun
        return $?
    fi
    return 1
}

# Download and install pre-built binary (lighter, no Ink TUI)
install_binary() {
    if ! command -v tar &> /dev/null; then
        error "tar is required for binary installation"
    fi

    local temp_dir=$(mktemp -d)
    local archive_name="nimbus-$PLATFORM-$ARCH.tar.gz"
    local download_url="$GITHUB_URL/releases/download/v$VERSION/$archive_name"

    info "Downloading Nimbus binary..."
    warn "Note: Pre-built binary does not include the rich Ink terminal UI."
    warn "For the full experience, install via: bun install -g @nimbus-ai/cli"

    if download "$download_url" "$temp_dir/$archive_name" 2>/dev/null; then
        info "Extracting..."
        mkdir -p "$INSTALL_DIR"
        tar -xzf "$temp_dir/$archive_name" -C "$INSTALL_DIR"
    else
        rm -rf "$temp_dir"
        return 1
    fi

    # Set up bin directory
    mkdir -p "$BIN_DIR"

    # Make executable
    chmod +x "$INSTALL_DIR/nimbus"

    # Create symlink in bin
    ln -sf "$INSTALL_DIR/nimbus" "$BIN_DIR/nimbus"

    # Cleanup
    rm -rf "$temp_dir"

    success "Nimbus binary installed!"
    return 0
}

# Add to PATH
setup_path() {
    if [ "${NIMBUS_NO_MODIFY_PATH:-0}" = "1" ]; then
        info "Skipping PATH modification (NIMBUS_NO_MODIFY_PATH is set)"
        return
    fi

    # Check if nimbus is already on PATH
    if command -v nimbus &> /dev/null; then
        return
    fi

    # For binary installs, add BIN_DIR to PATH
    if [ ! -d "$BIN_DIR" ]; then
        return
    fi

    # Detect shell
    local shell_name=$(basename "$SHELL")
    local shell_rc=""

    case "$shell_name" in
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                shell_rc="$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                shell_rc="$HOME/.bash_profile"
            fi
            ;;
        zsh)
            shell_rc="$HOME/.zshrc"
            ;;
        fish)
            shell_rc="$HOME/.config/fish/config.fish"
            ;;
        *)
            warn "Unknown shell: $shell_name. Please add $BIN_DIR to your PATH manually."
            return
            ;;
    esac

    if [ -n "$shell_rc" ]; then
        local path_export="export PATH=\"\$PATH:$BIN_DIR\""

        # Check if already in rc file
        if grep -q "$BIN_DIR" "$shell_rc" 2>/dev/null; then
            info "PATH already configured in $shell_rc"
        else
            echo "" >> "$shell_rc"
            echo "# Nimbus CLI" >> "$shell_rc"
            echo "$path_export" >> "$shell_rc"
            info "Added Nimbus to PATH in $shell_rc"
        fi
    fi
}

# Verify installation
verify_installation() {
    # Check common locations
    local nimbus_bin=""
    if command -v nimbus &> /dev/null; then
        nimbus_bin="$(command -v nimbus)"
    elif [ -x "$BIN_DIR/nimbus" ]; then
        nimbus_bin="$BIN_DIR/nimbus"
    fi

    if [ -n "$nimbus_bin" ]; then
        local version=$("$nimbus_bin" --version 2>/dev/null || echo "unknown")
        success "Nimbus installed successfully!"
        echo ""
        echo "  Version:  $version"
        echo "  Location: $nimbus_bin"
        echo ""
    else
        warn "Installation completed but nimbus is not yet on PATH."
        echo "  Restart your terminal or run: source ~/.bashrc (or ~/.zshrc)"
    fi
}

# Print next steps
print_next_steps() {
    echo -e "${GREEN}Next steps:${NC}"
    echo ""
    echo "  1. Restart your terminal (or source your shell config)"
    echo ""
    echo "  2. Verify installation:"
    echo "     nimbus --version"
    echo ""
    echo "  3. Start using Nimbus:"
    echo "     nimbus"
    echo ""
    echo "Documentation: $GITHUB_URL"
    echo "Get help: nimbus --help"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║          Nimbus CLI Installer              ║"
    echo "║   AI-powered infrastructure assistant      ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""

    detect_platform
    check_requirements
    get_latest_version

    local installed=false

    if [ "${NIMBUS_PREFER_BINARY:-0}" != "1" ]; then
        # Try package manager installs first (includes full Ink TUI)
        if install_via_bun; then
            installed=true
        elif install_via_npm; then
            installed=true
        elif install_bun_then_nimbus; then
            installed=true
        fi
    fi

    # Fall back to binary download
    if [ "$installed" = false ]; then
        if install_binary; then
            installed=true
            setup_path
        fi
    fi

    if [ "$installed" = false ]; then
        error "Installation failed. Please install manually: bun install -g @nimbus-ai/cli"
    fi

    verify_installation
    print_next_steps
}

# Run main function
main

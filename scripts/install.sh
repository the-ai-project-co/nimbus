#!/bin/bash
# Nimbus CLI Installer
# Usage: curl -fsSL https://nimbus.dev/install.sh | bash
#
# Environment variables:
#   NIMBUS_INSTALL_DIR - Installation directory (default: ~/.nimbus)
#   NIMBUS_VERSION     - Specific version to install (default: latest)
#   NIMBUS_NO_MODIFY_PATH - Set to 1 to skip PATH modification

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
            error "Windows is not supported by this installer. Please use npm install -g @nimbus/cli"
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

    if ! command -v tar &> /dev/null; then
        error "tar is required but not installed"
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
        VERSION=$(curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
        if [ -z "$VERSION" ]; then
            # Fallback to default version
            VERSION="1.0.0"
            warn "Could not fetch latest version, using $VERSION"
        fi
    fi
    info "Installing version: $VERSION"
}

# Download and extract Nimbus
install_nimbus() {
    local temp_dir=$(mktemp -d)
    local archive_name="nimbus-$PLATFORM-$ARCH.tar.gz"
    local download_url="$GITHUB_URL/releases/download/v$VERSION/$archive_name"

    info "Downloading Nimbus..."

    # Try to download release binary
    if download "$download_url" "$temp_dir/$archive_name" 2>/dev/null; then
        info "Extracting..."
        mkdir -p "$INSTALL_DIR"
        tar -xzf "$temp_dir/$archive_name" -C "$INSTALL_DIR"
    else
        # Fallback: install via npm
        warn "Pre-built binary not found, installing via npm..."
        install_via_npm
        rm -rf "$temp_dir"
        return
    fi

    # Set up bin directory
    mkdir -p "$BIN_DIR"

    # Make executable
    chmod +x "$INSTALL_DIR/nimbus"

    # Create symlink in bin
    ln -sf "$INSTALL_DIR/nimbus" "$BIN_DIR/nimbus"

    # Cleanup
    rm -rf "$temp_dir"
}

# Fallback: install via npm
install_via_npm() {
    if ! command -v npm &> /dev/null; then
        error "npm is required for installation. Please install Node.js first."
    fi

    info "Installing via npm..."
    npm install -g @nimbus/cli@$VERSION

    success "Nimbus installed via npm"
    exit 0
}

# Add to PATH
setup_path() {
    if [ "${NIMBUS_NO_MODIFY_PATH:-0}" = "1" ]; then
        info "Skipping PATH modification (NIMBUS_NO_MODIFY_PATH is set)"
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
    if [ -x "$BIN_DIR/nimbus" ]; then
        local version=$("$BIN_DIR/nimbus" --version 2>/dev/null || echo "unknown")
        success "Nimbus installed successfully!"
        echo ""
        echo "  Version: $version"
        echo "  Location: $BIN_DIR/nimbus"
        echo ""
    else
        error "Installation verification failed"
    fi
}

# Print next steps
print_next_steps() {
    echo -e "${GREEN}Next steps:${NC}"
    echo ""
    echo "  1. Restart your terminal or run:"
    echo "     source ~/.bashrc  # or ~/.zshrc"
    echo ""
    echo "  2. Verify installation:"
    echo "     nimbus --version"
    echo ""
    echo "  3. Run system check:"
    echo "     nimbus doctor"
    echo ""
    echo "  4. Initialize a project:"
    echo "     nimbus init"
    echo ""
    echo "  5. Start using Nimbus:"
    echo "     nimbus chat"
    echo ""
    echo "Documentation: $GITHUB_URL/docs"
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
    install_nimbus
    setup_path
    verify_installation
    print_next_steps
}

# Run main function
main

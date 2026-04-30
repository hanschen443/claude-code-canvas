#!/bin/sh
# Agent Canvas installer
# Usage: curl -fsSL https://raw.githubusercontent.com/cowbear6598/agent-canvas/main/install.sh | sh

set -eu

BINARY_NAME="agent-canvas"
GITHUB_REPO="cowbear6598/agent-canvas"
INSTALL_DIR="$HOME/.local/bin"

# ---------------------------------------------------------------------------
# Color output helpers (only when stdout is a tty)
# ---------------------------------------------------------------------------

init_colors() {
  if [ -t 1 ]; then
    BOLD="\033[1m"
    GREEN="\033[0;32m"
    RED="\033[0;31m"
    YELLOW="\033[0;33m"
    RESET="\033[0m"
  else
    BOLD=""
    GREEN=""
    RED=""
    YELLOW=""
    RESET=""
  fi
}

init_colors

info()    { printf "  %b\n" "$1"; }
success() { printf "  ${GREEN}✓${RESET} %b\n" "$1"; }
error()   { printf "  ${RED}✗ Error:${RESET} %b\n" "$1" >&2; }
warn()    { printf "  ${YELLOW}!${RESET} %b\n" "$1"; }
header()  { printf "\n  ${BOLD}%b${RESET}\n\n" "$1"; }

# ---------------------------------------------------------------------------
# Uninstall mode
# ---------------------------------------------------------------------------

if [ "${1:-}" = "--uninstall" ]; then
  TARGET_BIN="${INSTALL_DIR}/${BINARY_NAME}"
  if [ ! -f "$TARGET_BIN" ]; then
    warn "${BINARY_NAME} is not installed at ${TARGET_BIN}"
    exit 0
  fi

  rm -f "$TARGET_BIN"

  success "${BINARY_NAME} has been uninstalled"
  exit 0
fi

# ---------------------------------------------------------------------------
# Detect OS and architecture
# ---------------------------------------------------------------------------

header "Agent Canvas Installer"

info "Detecting platform..."

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_NAME="darwin" ;;
  Linux)  OS_NAME="linux" ;;
  *)
    error "Unsupported operating system: ${OS}"
    error "Windows is not supported. Please use WSL2 or a Linux/macOS machine."
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH_NAME="arm64" ;;
  x86_64)        ARCH_NAME="x64" ;;
  *)
    error "Unsupported architecture: ${ARCH}"
    exit 1
    ;;
esac

info "Detecting platform... ${OS} ${ARCH_NAME}"

# ---------------------------------------------------------------------------
# Fetch latest version
# ---------------------------------------------------------------------------

info "Fetching latest version..."

RELEASES_API="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"

# Try curl first, then wget
if command -v curl > /dev/null 2>&1; then
  RELEASE_JSON="$(curl -fsSL "$RELEASES_API")"
elif command -v wget > /dev/null 2>&1; then
  RELEASE_JSON="$(wget -qO- "$RELEASES_API")"
else
  error "Neither curl nor wget is available. Please install one of them and try again."
  exit 1
fi

# Parse tag_name without jq using grep + sed
VERSION="$(printf '%s' "$RELEASE_JSON" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"

if [ -z "$VERSION" ]; then
  error "Failed to fetch the latest version from GitHub API."
  exit 1
fi

# 驗證版本格式，防止拼接 URL 時發生 shell injection
case "$VERSION" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *)
    error "Invalid version format: ${VERSION}"
    exit 1
    ;;
esac

info "Fetching latest version... ${VERSION}"

# ---------------------------------------------------------------------------
# Download the binary
# ---------------------------------------------------------------------------

ASSET_NAME="${BINARY_NAME}-${OS_NAME}-${ARCH_NAME}"
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${ASSET_NAME}"
CHECKSUMS_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/checksums.txt"
TMP_DIR="$(mktemp -d)"
TMP_BIN="${TMP_DIR}/${BINARY_NAME}"
TMP_CHECKSUMS="${TMP_DIR}/checksums.txt"

info "Downloading ${ASSET_NAME}..."

if command -v curl > /dev/null 2>&1; then
  curl -fL# -o "$TMP_BIN" "$DOWNLOAD_URL"
  curl -fsSL -o "$TMP_CHECKSUMS" "$CHECKSUMS_URL"
elif command -v wget > /dev/null 2>&1; then
  wget -qO "$TMP_BIN" "$DOWNLOAD_URL"
  wget -qO "$TMP_CHECKSUMS" "$CHECKSUMS_URL"
fi

# 驗證 checksum（checksums.txt 格式：<sha256>  <filename>）
info "Verifying checksum..."
# 將二進位檔暫時命名為 ASSET_NAME 以符合 checksums.txt 中的檔名
TMP_VERIFY_BIN="${TMP_DIR}/${ASSET_NAME}"
cp "$TMP_BIN" "$TMP_VERIFY_BIN"
if ! (cd "$TMP_DIR" && grep "${ASSET_NAME}" checksums.txt | shasum -a 256 -c -); then
  error "Checksum verification failed. The downloaded file may be corrupted."
  rm -rf "$TMP_DIR"
  exit 1
fi
rm -f "$TMP_VERIFY_BIN"
success "Checksum verified"

chmod +x "$TMP_BIN"

# ---------------------------------------------------------------------------
# Install to PATH
# ---------------------------------------------------------------------------

DEST="${INSTALL_DIR}/${BINARY_NAME}"

info "Installing to ${DEST}..."

mkdir -p "$INSTALL_DIR"
mv "$TMP_BIN" "$DEST"

rm -rf "$TMP_DIR"

# ---------------------------------------------------------------------------
# Verify installation
# ---------------------------------------------------------------------------

if ! command -v "$BINARY_NAME" > /dev/null 2>&1; then
  warn "$INSTALL_DIR is not in your PATH."
  info "Add the following to your shell profile (~/.zshrc or ~/.bashrc):"
  info "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  exit 0
fi

INSTALLED_VERSION="$("$BINARY_NAME" --version 2>&1 || true)"

if [ -n "$INSTALLED_VERSION" ] && [ "$INSTALLED_VERSION" != "${VERSION#v}" ]; then
  warn "Installed version (${INSTALLED_VERSION}) may differ from expected (${VERSION}). Please verify the installation."
fi

printf "\n"
success "Agent Canvas ${VERSION} installed successfully!"
printf "\n"
info "Get started:"
info "  ${BOLD}${BINARY_NAME} start${RESET}"
printf "\n"


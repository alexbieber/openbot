#!/usr/bin/env bash
# OpenBot installer — macOS, Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/your/openbot/main/install.sh | bash

set -e

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
DIM="\033[2m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}OpenBot Installer${RESET}"
echo -e "${DIM}Your personal AI agent — any OS, any platform${RESET}"
echo "──────────────────────────────────────────────"

# ── Node.js check ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${BOLD}Node.js not found.${RESET}"
  echo "Install Node.js 20+ from https://nodejs.org"
  if command -v brew &>/dev/null; then
    echo "Or run: brew install node"
  fi
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "Node.js 20+ required (found v$NODE_VER). Upgrade at https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✓${RESET} Node.js $(node --version)"

# ── npm check ─────────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo "npm not found. Install Node.js from https://nodejs.org"; exit 1
fi

# ── Determine install directory ───────────────────────────────────────────────
INSTALL_DIR="${OPENBOT_INSTALL_DIR:-$HOME/.openbot-app}"

# If running from repo (install.sh in project root), install in place
if [ -f "$(dirname "$0")/package.json" ]; then
  INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
  IN_PLACE=true
fi

if [ -z "$IN_PLACE" ]; then
  echo -e "\n${BOLD}Install location:${RESET} $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  # Clone or download
  if command -v git &>/dev/null && [ -n "${OPENBOT_REPO:-}" ]; then
    echo -e "${DIM}Cloning from $OPENBOT_REPO...${RESET}"
    git clone "$OPENBOT_REPO" "$INSTALL_DIR" 2>/dev/null || true
  else
    echo -e "${DIM}Downloading OpenBot...${RESET}"
    # Copy local files if available
    if [ -d "$(dirname "$0")/gateway" ]; then
      cp -r "$(dirname "$0")/." "$INSTALL_DIR/"
    fi
  fi
fi

cd "$INSTALL_DIR"

# ── Install dependencies ──────────────────────────────────────────────────────
echo -e "\n${DIM}Installing dependencies...${RESET}"
npm install --silent 2>/dev/null || npm install

# ── Create symlink ────────────────────────────────────────────────────────────
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
OPENBOT_BIN="$BIN_DIR/openbot"

cat > "$OPENBOT_BIN" << EOF
#!/usr/bin/env bash
exec node "$INSTALL_DIR/cli/index.js" "\$@"
EOF
chmod +x "$OPENBOT_BIN"

# Add to PATH if needed
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then SHELL_RC="$HOME/.bash_profile"
fi

if [ -n "$SHELL_RC" ] && ! grep -q '\.local/bin' "$SHELL_RC" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
  echo -e "${GREEN}✓${RESET} Added ~/.local/bin to PATH in $SHELL_RC"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}──────────────────────────────────────────────${RESET}"
echo -e "${GREEN}✓ OpenBot installed!${RESET}"
echo -e "${BOLD}──────────────────────────────────────────────${RESET}"
echo ""
echo -e "  Run setup:    ${CYAN}openbot onboard${RESET}"
echo -e "  Start:        ${CYAN}openbot daemon start${RESET}"
echo -e "  Dashboard:    ${CYAN}openbot dashboard${RESET}"
echo -e "  Chat (CLI):   ${CYAN}openbot tui${RESET}"
echo ""
echo -e "${DIM}Reload your terminal or run: source $SHELL_RC${RESET}"
echo ""

#!/bin/bash
set -e
cd "$(dirname "$0")"

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed. Install it from https://nodejs.org or run: brew install node"
  exit 1
fi

if ! command -v claude &>/dev/null; then
  echo "Error: Claude Code CLI is not installed. Run: npm install -g @anthropic-ai/claude-code"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Building Clui CC..."
if ! npx electron-vite build --mode production; then
  echo
  echo "Build failed. Try these steps:"
  echo "1) Ensure Xcode Command Line Tools are installed: xcode-select --install"
  echo "2) Reinstall dependencies: npm install"
  exit 1
fi

echo "Clui CC running. Alt+Space to toggle. Use ./stop.command or tray icon > Quit to close."
exec npx electron .

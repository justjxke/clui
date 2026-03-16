#!/bin/bash
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
pkill -f "$REPO_DIR/node_modules/electron" 2>/dev/null
pkill -f "$REPO_DIR/dist/main" 2>/dev/null
echo "Clui CC stopped."

#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
SKIP_START="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2:-3000}"
      shift 2
      ;;
    --skip-start)
      SKIP_START="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: ./scripts/bootstrap.sh [--port 3000] [--skip-start]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/app"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm not found. Attempting Node.js LTS installation..."

  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
    sudo dnf install -y nodejs
  else
    echo "Unsupported package manager. Install Node.js LTS from https://nodejs.org and re-run."
    exit 1
  fi
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "App directory not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"
echo "Installing app dependencies..."
npm install

if [[ "$SKIP_START" == "true" ]]; then
  echo "Dependencies installed. Start later with: cd app && npm start"
  exit 0
fi

echo "Starting server on port $PORT ..."
PORT="$PORT" npm start

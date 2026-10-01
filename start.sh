#!/usr/bin/env sh
# macOS / Linux launcher
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 18+ from https://nodejs.org/"; exit 1; }
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }
exec node server.js --open

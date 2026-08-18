#!/usr/bin/env bash
# ============================================================
# Dit Shop - Quick start script (Linux / macOS)
# ============================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/backend"

if [ ! -f .env ]; then
    echo "Creating .env from .env.example ..."
    cp .env.example .env
    echo ""
    echo "*** Edit backend/.env to set your MySQL password and JWT_SECRET ***"
    echo ""
fi

if [ ! -d node_modules ]; then
    echo "Installing dependencies ..."
    npm install
fi

echo ""
echo "Starting Dit Shop server on http://localhost:3000 ..."
echo "Press Ctrl+C to stop."
echo ""
npm start

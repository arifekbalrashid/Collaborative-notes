#!/usr/bin/env bash
set -o errexit
set -o pipefail

echo "═══════════════════════════════════════════════════════════════"
echo "  Collaborative Notes — Build Script"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo "▶ [1/2] Installing Python dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt
echo "✓ Python dependencies installed."

echo ""
echo "▶ [2/2] Installing frontend dependencies..."
if [ -f "frontend/package.json" ]; then
    cd frontend
    npm install --production
    cd ..
    echo "✓ Frontend npm packages installed."
else
    echo "  (no package.json found — skipping)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Build complete ✓"
echo "═══════════════════════════════════════════════════════════════"
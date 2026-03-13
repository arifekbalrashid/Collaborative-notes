#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Build script for Render deployment
# Called by render.yaml → buildCommand
# ──────────────────────────────────────────────────────────────────────

set -o errexit   # Exit on any error
set -o pipefail  # Pipe errors propagate

echo "═══════════════════════════════════════════════════════════════"
echo "  Collaborative Notes — Build Script"
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Python Dependencies ───────────────────────────────────────────
echo ""
echo "▶ [1/3] Installing Python dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt
echo "✓ Python dependencies installed."

# ── 2. Frontend Dependencies (if package.json exists) ────────────────
echo ""
echo "▶ [2/3] Installing frontend dependencies..."
if [ -f "frontend/package.json" ]; then
    cd frontend
    npm install --production
    cd ..
    echo "✓ Frontend npm packages installed."
else
    echo "  (no package.json found — skipping)"
fi

# ── 3. Aiven CA Certificate ─────────────────────────────────────────
echo ""
echo "▶ [3/3] Writing Aiven CA certificate..."
if [ -n "$AIVEN_CA_CERT" ]; then
    # Write to app directory (writable on Render)
    mkdir -p certs
    echo "$AIVEN_CA_CERT" > ./certs/aiven-ca.pem
    chmod 644 ./certs/aiven-ca.pem
    echo "✓ CA certificate written to ./certs/aiven-ca.pem"
    
    # Export the path for use in the app
    export MYSQL_SSL_CA="./certs/aiven-ca.pem"
else
    echo "⚠ WARNING: AIVEN_CA_CERT env var is not set."
    echo "  SSL connections to Aiven MySQL will fail without it."
    echo "  Set it in Render → Environment → AIVEN_CA_CERT"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Build complete ✓"
echo "═══════════════════════════════════════════════════════════════"

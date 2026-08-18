#!/usr/bin/env bash
# ============================================================
# Dit Shop - Stop running server on port 3000 (Linux / macOS)
# ============================================================

echo "Stopping Dit Shop server on port 3000..."

PID=$(lsof -ti:3000 2>/dev/null || true)

if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
    echo "  Killed PID $PID"
else
    echo "  (no server was running on port 3000)"
fi

echo ""
echo "Done."

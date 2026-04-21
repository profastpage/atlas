#!/bin/bash
# ========================================
# prebuild.sh — Generate version.json with real build metadata
# This runs BEFORE next build to stamp the version
# ========================================

COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_NUM=$(date +%s)

cat > public/version.json << EOF
{
  "version": "atlas-${BUILD_NUM}",
  "commit": "${COMMIT_HASH}",
  "timestamp": "${TIMESTAMP}",
  "build": ${BUILD_NUM}
}
EOF

echo "[PREBUILD] version.json generated: atlas-${BUILD_NUM} (commit ${COMMIT_HASH})"

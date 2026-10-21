#!/bin/bash
# ==============================================================================
# Automated Deployment & Docker Cleanup Script for AWS EC2
# ==============================================================================
set -e

echo "🚀 [1/5] Pulling latest code from origin main..."
git pull origin main

echo "📦 [2/5] Building Docker image..."
docker build -t f1-ai-telemetry .

echo "🛑 [3/5] Stopping and removing previous container..."
docker stop f1-ai-telemetry 2>/dev/null || true
docker rm f1-ai-telemetry 2>/dev/null || true

echo "▶️ [4/5] Starting new container on port 80..."
docker run -d \
  --name f1-ai-telemetry \
  --restart always \
  -p 80:5000 \
  -e PORT=5000 \
  f1-ai-telemetry

echo "🧹 [5/5] Automatically pruning old and dangling Docker images..."
# Removes untagged/dangling images immediately to keep disk free
docker image prune -f
# Prunes unused build cache older than 24 hours
docker builder prune -f --filter "until=24h"

echo "✅ Deployment complete! App is live on http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || echo 'localhost')"

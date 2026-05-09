#!/bin/bash
# SeenIt — Build and deploy to GitHub Pages
# Run from the seenit/ folder:  bash DEPLOY.sh
#
# PREREQUISITES:
#   1. Create a .env file with your API keys (see .env.example)
#   2. GitHub repo "dromako/seenit" must exist
#   3. GitHub Pages must be set to deploy from gh-pages branch
#
# NEVER commit API keys to this script or any tracked file.

set -e
cd "$(dirname "$0")"

echo ""
echo "SeenIt Deploy"
echo "============="

# ── Preflight: check .env exists ──
if [ ! -f .env ]; then
  echo "ERROR: No .env file found. Copy .env.example and fill in your keys."
  echo "  cp .env.example .env"
  exit 1
fi

# ── Step 1: Build ──
echo ""
echo "Building..."
npm run build

# ── Step 2: Prepare dist for GitHub Pages ──
echo ""
echo "Preparing deploy..."

# SPA fallback: copy index.html to 404.html so GH Pages
# serves the app for any route (client-side routing)
cp dist/404.html dist/404.html 2>/dev/null || cp dist/index.html dist/404.html

# Prevent Jekyll processing
touch dist/.nojekyll

# ── Step 3: Deploy to gh-pages branch ──
echo ""
echo "Pushing to gh-pages..."

cd dist
git init
git checkout -b gh-pages
git add -A
git commit -m "deploy: $(date -u '+%Y-%m-%d %H:%M UTC')"
git remote add origin https://github.com/dromako/seenit.git 2>/dev/null || true
git push -f origin gh-pages

cd ..
echo ""
echo "Live at: https://dromako.github.io/seenit/"
echo ""

#!/bin/bash
# Auto-deploy script for browser-logger extension
# Usage: ./deploy.sh [version]

set -e

cd "$(dirname "$0")"

# Get version from manifest or argument
if [ -n "$1" ]; then
    VERSION="$1"
else
    VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
fi

echo "=== Deploying Browser Logger Extension v$VERSION ==="

# Update version in manifest if provided as argument
if [ -n "$1" ]; then
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" manifest.json
fi

# Update update.xml
sed -i "s|download/v[^/]*/browser-logger-extension-v[^.]*\.crx|download/v$VERSION/browser-logger-extension-v$VERSION.crx|" update.xml
sed -i "s|version='[^']*'|version='$VERSION'|" update.xml

# Create zip (exclude unnecessary files)
rm -f "browser-logger-v$VERSION.zip"
zip -r "browser-logger-v$VERSION.zip" \
    background.js content.js devtools.js devtools.html \
    manifest.json panel.html panel.js popup.html popup.js \
    icon128.png icon.png icon.svg

echo "Created: browser-logger-v$VERSION.zip"

# Commit changes
git add -A
git commit -m "Release v$VERSION

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" || true

# Push to GitHub
git push origin main

# Create GitHub release
if gh release view "v$VERSION" &>/dev/null; then
    echo "Release v$VERSION already exists, updating..."
    gh release upload "v$VERSION" "browser-logger-v$VERSION.zip" --clobber
else
    gh release create "v$VERSION" "browser-logger-v$VERSION.zip" \
        --title "v$VERSION" \
        --notes "Browser Logger Extension v$VERSION

Download and extract zip, then load as unpacked extension in Chrome."
fi

# Bump server version for hot-reload
curl -s -X POST http://45.139.76.176:20847/bump

echo ""
echo "=== Deploy Complete ==="
echo "GitHub: https://github.com/arwoxbx24/browser-logger-extension/releases/tag/v$VERSION"
echo "Users can update with: iwr ... | iex (PowerShell)"

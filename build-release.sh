#!/bin/bash
# Build and release Chrome extension with auto-update
# Usage: ./build-release.sh [patch|minor|major]

set -e

BUMP_TYPE=${1:-patch}
MANIFEST="manifest.json"
UPDATE_XML="update.xml"
REPO="arwoxbx24/browser-logger-extension"
KEY_FILE="extension.pem"

# Generate key if not exists
if [ ! -f "$KEY_FILE" ]; then
    echo "Generating extension key..."
    openssl genrsa -out "$KEY_FILE" 2048
    echo "⚠️  IMPORTANT: Keep $KEY_FILE safe! It's needed for all future updates."
fi

# Get current version
CURRENT_VERSION=$(grep '"version"' $MANIFEST | sed 's/.*"version": "\([^"]*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"

# Bump version
IFS='.' read -ra VER <<< "$CURRENT_VERSION"
MAJOR=${VER[0]}
MINOR=${VER[1]}
PATCH=${VER[2]}

case $BUMP_TYPE in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update manifest.json with new version
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" $MANIFEST

# Create temp directory for clean build
BUILD_DIR=$(mktemp -d)
cp -r *.js *.html *.json *.png *.svg "$BUILD_DIR/" 2>/dev/null || true

# Create CRX file
CRX_NAME="browser-logger-extension-v$NEW_VERSION.crx"
crx pack "$BUILD_DIR" -o "$CRX_NAME" -p "$KEY_FILE"
rm -rf "$BUILD_DIR"

# Also create ZIP for manual install
ZIP_NAME="browser-logger-extension-v$NEW_VERSION.zip"
zip -r "$ZIP_NAME" *.js *.html *.json *.png *.svg 2>/dev/null || zip -r "$ZIP_NAME" . -x "*.git*" -x "*.sh" -x "*.xml" -x "*.pem" -x "*.crx" -x "*.zip"

# Get extension ID from CRX
# Extension ID is computed from public key, we can extract it
EXTENSION_ID=$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 -binary | head -c 16 | xxd -p | tr '0-9a-f' 'a-p')
echo "Extension ID: $EXTENSION_ID"

# Create update.xml for Chrome auto-update
cat > $UPDATE_XML << EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXTENSION_ID'>
    <updatecheck codebase='https://github.com/$REPO/releases/download/v$NEW_VERSION/$CRX_NAME' version='$NEW_VERSION' />
  </app>
</gupdate>
EOF

echo "Created: $CRX_NAME"
echo "Created: $ZIP_NAME"
echo "Created: $UPDATE_XML"

# Commit and push
git add -A
git commit -m "Release v$NEW_VERSION" || true
git push origin main 2>/dev/null || git push -u origin main

# Create GitHub release
gh release create "v$NEW_VERSION" "$CRX_NAME" "$ZIP_NAME" $UPDATE_XML \
  --repo $REPO \
  --title "v$NEW_VERSION" \
  --notes "Auto-update release v$NEW_VERSION

## Installation
- **New install**: Download ZIP, unpack, load in chrome://extensions
- **Auto-update**: Extension updates automatically

Extension ID: $EXTENSION_ID"

echo ""
echo "✅ Released v$NEW_VERSION"
echo "CRX: https://github.com/$REPO/releases/download/v$NEW_VERSION/$CRX_NAME"
echo "ZIP: https://github.com/$REPO/releases/download/v$NEW_VERSION/$ZIP_NAME"
echo "Update XML: https://github.com/$REPO/releases/download/v$NEW_VERSION/update.xml"

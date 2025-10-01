#!/bin/bash
# Quick local testing script for the package

set -e

echo "🔨 Building package..."
npm run build

echo "📦 Packing package..."
npm pack

TARBALL=$(ls -t hopdrive-hasura-event-detector-*.tgz | head -1)
echo "✅ Created: $TARBALL"

echo ""
echo "To install in your test project, run:"
echo "  npm install $PWD/$TARBALL --force"
echo ""
echo "Then:"
echo "  hasura-event-detector console init"
echo "  npm run event-console"

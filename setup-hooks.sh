#!/bin/bash

# Setup script for Husky, Commitlint, and Commitizen
# This script initializes Git hooks and makes them executable

echo "🚀 Setting up Git hooks and commit quality tools..."

# Check if we're in a Git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not a Git repository. Please run this script from the project root."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: pnpm is not installed. Please install pnpm first."
    echo "   Visit: https://pnpm.io/installation"
    exit 1
fi

echo "📦 Installing dependencies..."
pnpm install

echo "🔧 Initializing Husky..."
pnpm prepare

echo "🔐 Making hook scripts executable..."
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Try making a commit: pnpm commit"
echo "   2. Read the documentation: docs/COMMIT_CONVENTIONS.md"
echo "   3. For troubleshooting: HUSKY_SETUP.md"
echo ""
echo "🎉 You're all set! Happy coding!"

#!/bin/bash
set -euo pipefail

echo "=== Setting up YC Job Hunter ==="

# Create directories
mkdir -p src/yc-job-hunter tests data

# Install dependencies (merge with existing package.json)
npm install zod commander chalk dotenv open clipboardy
npm install -D @types/node ts-node jest @types/jest ts-jest

# Add npm scripts to package.json (use npm pkg set)
npm pkg set scripts.hunt="ts-node src/yc-job-hunter/index.ts"
npm pkg set scripts.scan="ts-node src/yc-job-hunter/scan.ts"
npm pkg set scripts.apply="ts-node src/yc-job-hunter/apply.ts"

# Ensure tsconfig has the right settings
# (esModuleInterop, resolveJsonModule, etc)

# Add to .gitignore
echo "data/yc_hiring_raw.json" >> .gitignore
echo "data/matches.json" >> .gitignore
echo "data/scan_log.json" >> .gitignore
echo ".env" >> .gitignore

# Create .env.example
echo "ANTHROPIC_API_KEY=your-key-here" > .env.example

# Verify
echo ""
echo "=== Verifying ==="
npx ts-node -e "console.log('ts-node works')"
npx jest --version && echo "jest installed"
echo ""
echo "YC Job Hunter ready. Run: npm run hunt"

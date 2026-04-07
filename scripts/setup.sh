#!/usr/bin/env bash
set -euo pipefail
echo "🚀 EmproiumVipani — Local Setup"
echo "================================"

# Node version check
node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Found: $(node --version)"
  exit 1
fi

echo "✅ Node.js $(node --version)"

# Install root deps
echo ""
echo "📦 Installing frontend dependencies..."
npm install --legacy-peer-deps

# Install server deps
echo ""
echo "📦 Installing backend dependencies..."
cd server && npm install && cd ..

# Copy env files
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env 2>/dev/null || cat > server/.env << 'EOF'
PORT=5000
MONGODB_URI=mongodb://localhost:27017/emproiumvipani
JWT_SECRET=change-this-to-a-secure-random-string-in-production
JWT_EXPIRE=15m
CLIENT_URL=http://localhost:5173
NODE_ENV=development
OTP_PROVIDER=console
EOF
  echo "✅ Created server/.env — update with your real values"
fi

echo ""
echo "🌱 Seeding database..."
node server/scripts/db-seed.js || echo "⚠️  Seed skipped (MongoDB may not be running)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "   Start backend:   cd server && npm run dev"
echo "   Start frontend:  npm run dev"
echo "   Run tests:       npm test"
echo "   Run E2E:         npm run test:e2e"

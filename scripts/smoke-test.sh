#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${SMOKE_BASE_URL:-http://localhost:4173}"
API_URL="${SMOKE_API_URL:-http://localhost:5000}"

echo "🔍 Smoke tests → $BASE_URL"

pass=0; fail=0

check() {
  local label="$1"; local url="$2"; local expected="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
  if [ "$status" = "$expected" ]; then
    echo "  ✅ $label (HTTP $status)"
    ((pass++)) || true
  else
    echo "  ❌ $label — expected HTTP $expected, got $status"
    ((fail++)) || true
  fi
}

check "Home page"    "$BASE_URL/"
check "Admin page"   "$BASE_URL/admin.html"
check "API health"   "$API_URL/api/health"   || true
check "Products API" "$API_URL/api/products" || true

echo ""
echo "Results: ✅ $pass passed  ❌ $fail failed"
[ "$fail" -eq 0 ] || exit 1

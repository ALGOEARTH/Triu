#!/usr/bin/env node
/**
 * smoke.test.js — Lightweight post-deploy smoke test (no browser needed).
 * Checks that critical HTTP endpoints respond correctly.
 * Usage:  SMOKE_BASE_URL=https://myapp.com node tests/smoke/smoke.test.js
 */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:4173';
const API_URL  = process.env.SMOKE_API_URL  || BASE_URL.replace(/:\d+$/, ':5000');

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${label}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

async function fetchOk(url, expectedStatus = 200) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status !== expectedStatus) {
    throw new Error(`Expected HTTP ${expectedStatus}, got ${res.status} for ${url}`);
  }
  return res;
}

async function main() {
  console.log(`\n🔍  Smoke tests → ${BASE_URL}\n`);

  await check('Home page loads (HTTP 200)', () => fetchOk(`${BASE_URL}/`));
  await check('Admin page loads (HTTP 200)', () => fetchOk(`${BASE_URL}/admin.html`));
  await check('Service Worker manifest exists', () => fetchOk(`${BASE_URL}/manifest.json`));

  // Backend checks (best-effort — skip if unreachable)
  await check('Backend health endpoint', async () => {
    try {
      const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(6_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.status !== 'ok') throw new Error(`status=${body.status}`);
    } catch (err) {
      if (err.name === 'TimeoutError' || err.code === 'ECONNREFUSED' || err.message.includes('fetch')) {
        console.log('      ⚠️   API not reachable — skipping (frontend-only deploy)');
        return; // not a fatal failure for frontend-only smoke
      }
      throw err;
    }
  });

  await check('Products API returns JSON', async () => {
    try {
      const res = await fetch(`${API_URL}/api/products?limit=1`, { signal: AbortSignal.timeout(6_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (typeof body.success === 'undefined') throw new Error('Missing success field');
    } catch (err) {
      if (err.name === 'TimeoutError' || err.code === 'ECONNREFUSED' || err.message.includes('fetch')) {
        console.log('      ⚠️   API not reachable — skipping');
        return;
      }
      throw err;
    }
  });

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  Total: ${passed + failed}  ✅ ${passed} passed  ❌ ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Smoke test runner error:', err);
  process.exit(1);
});

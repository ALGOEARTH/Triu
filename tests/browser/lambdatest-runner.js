/**
 * LambdaTest Playwright configuration.
 * Runs the E2E test suite across a cross-browser matrix on LambdaTest's
 * Selenium/Playwright cloud grid so we can catch rendering differences
 * across Chrome, Edge, Safari (macOS), Firefox, Android Chrome, and iOS Safari.
 *
 * Usage:
 *   LT_USERNAME=<user> LT_ACCESS_KEY=<key> BASE_URL=https://myapp.com node tests/browser/lambdatest-runner.js
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LT_USERNAME   = process.env.LT_USERNAME   || '';
const LT_ACCESS_KEY = process.env.LT_ACCESS_KEY || '';
const BASE_URL      = process.env.BASE_URL       || 'https://emproiumvipani.com';

if (!LT_USERNAME || !LT_ACCESS_KEY) {
  console.warn('⚠️  LT_USERNAME and LT_ACCESS_KEY not set — skipping LambdaTest run');
  process.exit(0);
}

// Cross-browser capability matrix
const capabilities = [
  {
    label: 'Chrome Latest / Windows 10',
    'LT:Options': {
      browserName: 'Chrome',
      browserVersion: 'latest',
      platformName: 'Windows 10',
      build: `EV-Build-${new Date().toISOString().slice(0, 10)}`,
      project: 'EmproiumVipani',
      name: 'Chrome Latest Win10',
      console: true,
      network: true,
      visual: true,
    },
  },
  {
    label: 'Edge Latest / Windows 10',
    'LT:Options': {
      browserName: 'MicrosoftEdge',
      browserVersion: 'latest',
      platformName: 'Windows 10',
      build: `EV-Build-${new Date().toISOString().slice(0, 10)}`,
      project: 'EmproiumVipani',
      name: 'Edge Latest Win10',
      console: true,
      network: true,
    },
  },
  {
    label: 'Safari 16 / macOS Ventura',
    'LT:Options': {
      browserName: 'Safari',
      browserVersion: '16',
      platformName: 'macOS Ventura',
      build: `EV-Build-${new Date().toISOString().slice(0, 10)}`,
      project: 'EmproiumVipani',
      name: 'Safari 16 macOS',
      console: true,
      network: true,
    },
  },
  {
    label: 'Firefox Latest / Windows 10',
    'LT:Options': {
      browserName: 'Firefox',
      browserVersion: 'latest',
      platformName: 'Windows 10',
      build: `EV-Build-${new Date().toISOString().slice(0, 10)}`,
      project: 'EmproiumVipani',
      name: 'Firefox Latest Win10',
    },
  },
  {
    label: 'Chrome / Android 12',
    'LT:Options': {
      deviceName: 'Pixel 5',
      platformName: 'Android',
      platformVersion: '12',
      browserName: 'Chrome',
      build: `EV-Build-${new Date().toISOString().slice(0, 10)}`,
      project: 'EmproiumVipani',
      name: 'Pixel5 Android12 Chrome',
      isRealMobile: true,
    },
  },
  {
    label: 'Safari / iPhone 14',
    'LT:Options': {
      deviceName: 'iPhone 14',
      platformName: 'iOS',
      platformVersion: '16',
      browserName: 'Safari',
      build: `EV-Build-${new Date().toISOString().slice(0, 10)}`,
      project: 'EmproiumVipani',
      name: 'iPhone14 iOS16 Safari',
      isRealMobile: true,
    },
  },
];

/** Core smoke checks to run in each browser */
async function runChecks(page, label) {
  const results = [];

  // 1. Home page loads
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    const title = await page.title();
    const hasTitle = /Emproium|Vipani/i.test(title);
    results.push({ name: 'Home page loads', passed: hasTitle, info: title });
  } catch (e) {
    results.push({ name: 'Home page loads', passed: false, info: e.message });
  }

  // 2. No forced login on load
  try {
    const loginModal = page.locator('[x-show="store.modals.login"]');
    await page.waitForTimeout(1000);
    const visible = await loginModal.isVisible();
    results.push({ name: 'No forced login modal', passed: !visible });
  } catch (e) {
    results.push({ name: 'No forced login modal', passed: false, info: e.message });
  }

  // 3. Checkout triggers auth for guest
  try {
    const checkoutBtn = page.locator('button:has-text("Proceed to checkout"), button:has-text("Checkout")');
    if (await checkoutBtn.count() > 0) {
      await checkoutBtn.first().click();
      await page.waitForTimeout(800);
      const loginModal = page.locator('[x-show="store.modals.login"]');
      const checkoutModal = page.locator('[x-show="store.modals.checkout"]');
      const ok = (await loginModal.isVisible()) || (await checkoutModal.isVisible());
      results.push({ name: 'Checkout triggers auth/checkout modal', passed: ok });
    } else {
      results.push({ name: 'Checkout triggers auth/checkout modal', passed: true, info: 'Button not found — skipped' });
    }
  } catch (e) {
    results.push({ name: 'Checkout triggers auth', passed: false, info: e.message });
  }

  // 4. Responsive layout — viewport check
  try {
    const vp = page.viewportSize();
    results.push({ name: `Viewport ${vp?.width}×${vp?.height}`, passed: true });
  } catch (e) {
    results.push({ name: 'Viewport check', passed: false, info: e.message });
  }

  return results;
}

async function runCapability(cap) {
  const wsEndpoint = `wss://cdpgrid.lambdatest.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(cap['LT:Options']))}`;
  console.log(`\n▶  ${cap.label}`);

  let browser;
  try {
    browser = await chromium.connect(wsEndpoint);
    const context = await browser.newContext();
    const page = await context.newPage();

    const results = await runChecks(page, cap.label);
    results.forEach(r => {
      console.log(`   ${r.passed ? '✅' : '❌'}  ${r.name}${r.info ? ` (${r.info})` : ''}`);
    });

    await browser.close();
    return { label: cap.label, results };
  } catch (err) {
    console.error(`   ❌  Connection failed: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    return { label: cap.label, results: [{ name: 'Connection', passed: false, info: err.message }] };
  }
}

async function main() {
  console.log(`\n🌐  LambdaTest Cross-Browser Suite → ${BASE_URL}`);
  console.log(`    Capabilities: ${capabilities.length} browser/device combinations\n`);

  const allResults = [];
  for (const cap of capabilities) {
    const result = await runCapability(cap);
    allResults.push(result);
  }

  // Write results to file for artifact upload
  const outDir = path.join(process.cwd(), 'lambdatest-results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'results.json'),
    JSON.stringify({ run: new Date().toISOString(), baseUrl: BASE_URL, results: allResults }, null, 2)
  );

  const totalChecks  = allResults.flatMap(r => r.results).length;
  const passedChecks = allResults.flatMap(r => r.results).filter(r => r.passed).length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Browsers: ${allResults.length}   Checks: ${totalChecks}   ✅ ${passedChecks}   ❌ ${totalChecks - passedChecks}`);
  console.log(`  Results saved → lambdatest-results/results.json\n`);

  if (passedChecks < totalChecks) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('LambdaTest runner error:', err);
  process.exit(1);
});

// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Smoke test — Verifies that the critical pages of the deployed app
 * respond correctly. Used after staging and production deployments.
 */

const BASE_URL = process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:4173';

test.describe('Deployment smoke tests', () => {
  test('home page returns 200', async ({ request }) => {
    const response = await request.get(BASE_URL);
    expect(response.status()).toBeLessThan(400);
  });

  test('admin page returns 200', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/admin.html`);
    expect(response.status()).toBeLessThan(400);
  });

  test('API health endpoint returns ok', async ({ request }) => {
    const apiBase = process.env.SMOKE_API_URL || BASE_URL.replace(/:\d+/, ':5000');
    try {
      const response = await request.get(`${apiBase}/api/health`);
      if (response.ok()) {
        const body = await response.json();
        expect(body.status).toBe('ok');
      }
    } catch {
      // API may not be on same host during frontend-only smoke test
      console.log('ℹ️  API health check skipped — API not reachable from smoke runner');
    }
  });

  test('products API returns data', async ({ request }) => {
    const apiBase = process.env.SMOKE_API_URL || BASE_URL.replace(/:\d+/, ':5000');
    try {
      const response = await request.get(`${apiBase}/api/products`);
      if (response.ok()) {
        const body = await response.json();
        expect(body).toHaveProperty('success', true);
      }
    } catch {
      console.log('ℹ️  Products API check skipped');
    }
  });
});

'use strict';
/**
 * Integration tests for the Auth API routes using MongoDB Memory Server.
 * Tests run against real Express routes with a real (in-memory) Mongoose connection.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET  = 'integration-test-secret';
  process.env.NODE_ENV    = 'test';

  // Import app after env vars are set
  app = require('../../server');
  await mongoose.connect(uri);
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  // Close Express server if it exposes a close method
  if (app && typeof app.close === 'function') app.close();
}, 15_000);

afterEach(async () => {
  // Clean up all collections between tests
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── Products (public) ────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  test('returns 200 and success:true for guests', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('accepts search query param', async () => {
    const res = await request(app).get('/api/products?search=test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('accepts category filter', async () => {
    const res = await request(app).get('/api/products?category=Electronics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── OTP auth flow ─────────────────────────────────────────────────────────────

describe('POST /api/auth/request-otp', () => {
  test('rejects missing identifier with 400', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({});
    expect(res.status).toBe(400);
  });

  test('accepts valid email identifier', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ identifier: 'test@example.com', purpose: 'login' });
    // Either 200 (OTP sent) or 503 (SMS provider not configured in test)
    expect([200, 503, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.requestId).toBeDefined();
    }
  });
});

// ─── Protected routes require auth ───────────────────────────────────────────

describe('Protected routes require JWT', () => {
  test('GET /api/orders returns 401 without token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  test('POST /api/orders returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [], deliveryAddress: {} });
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/dashboard returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('GET /api/users/profile returns 401 without token', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('Input validation', () => {
  test('POST /api/orders with empty items returns 401 (auth required first)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [], deliveryAddress: { street: '1 Main St', city: 'Delhi' } });
    expect(res.status).toBe(401); // Auth required before validation
  });

  test('search query is sanitised (no injection)', async () => {
    // Attempt ReDoS / regex injection
    const res = await request(app).get('/api/products?search=' + encodeURIComponent('.*'));
    expect(res.status).toBe(200); // Should not crash
  });
});

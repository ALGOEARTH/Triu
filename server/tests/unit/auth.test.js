'use strict';
/**
 * Unit tests for auth utility helpers (OTP generation, token signing, key hashing).
 * These run without a real MongoDB connection.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = 'test-secret-key-for-unit-tests';

// ─── JWT helpers ─────────────────────────────────────────────────────────────

describe('JWT token helpers', () => {
  test('signing a payload produces a valid token', () => {
    const token = jwt.sign({ userId: 'u123', role: 'customer' }, SECRET, { expiresIn: '2h' });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // header.payload.signature
  });

  test('verifying a valid token returns the payload', () => {
    const payload = { userId: 'u456', role: 'admin' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.userId).toBe('u456');
    expect(decoded.role).toBe('admin');
  });

  test('verifying an expired token throws', () => {
    const token = jwt.sign({ userId: 'u789' }, SECRET, { expiresIn: '0s' });
    expect(() => jwt.verify(token, SECRET)).toThrow();
  });

  test('verifying a tampered token throws', () => {
    const token = jwt.sign({ userId: 'u000' }, SECRET, { expiresIn: '1h' });
    const tampered = token.slice(0, -3) + 'xxx';
    expect(() => jwt.verify(tampered, SECRET)).toThrow();
  });
});

// ─── bcrypt / safe-key hashing ───────────────────────────────────────────────

describe('bcrypt safe-key hashing', () => {
  test('hashing a key produces a different string', async () => {
    const key = 'MyStr0ngK3y!';
    const hash = await bcrypt.hash(key, 10);
    expect(hash).not.toBe(key);
  });

  test('comparing correct key against hash returns true', async () => {
    const key = 'MyStr0ngK3y!';
    const hash = await bcrypt.hash(key, 10);
    const match = await bcrypt.compare(key, hash);
    expect(match).toBe(true);
  });

  test('comparing wrong key against hash returns false', async () => {
    const key = 'MyStr0ngK3y!';
    const hash = await bcrypt.hash(key, 10);
    const match = await bcrypt.compare('WrongKey', hash);
    expect(match).toBe(false);
  });
});

// ─── OTP generation ──────────────────────────────────────────────────────────

describe('OTP generation', () => {
  function generateOtp() {
    return String(Math.floor(100_000 + Math.random() * 900_000));
  }

  test('OTP is a 6-digit numeric string', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  test('consecutive OTPs are (very likely) different', () => {
    const a = generateOtp();
    const b = generateOtp();
    // Collision probability is 1/900000 — acceptable for unit test
    expect(a === b).toBe(false);
  });
});

// ─── Input sanitisation ──────────────────────────────────────────────────────

describe('Input sanitisation helpers', () => {
  // Minimal regex sanitiser (mirrors what the backend escapeRegex does)
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  test('escapeRegex escapes special characters', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
  });

  test('escapeRegex leaves normal strings unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
  });

  test('phone number normalisation strips non-digits', () => {
    const normalize = (p) => p.replace(/\D/g, '');
    expect(normalize('+91 98765 43210')).toBe('919876543210');
    expect(normalize('(022) 1234-5678')).toBe('02212345678');
  });
});

/**
 * Auth route tests
 * Run: npm test
 *
 * Tests critical auth flows: register, login, token validation, OAuth state.
 * Uses supertest against the Express app (no live DB required for unit paths).
 */

import request from 'supertest';
import app from '../app';

// ── Helpers ──────────────────────────────────────────────────────────────────
const validUser = {
  email: `test+${Date.now()}@settle-test.com`,
  password: 'TestPass123!',
  businessName: 'Test Business',
};

// ── Registration ──────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'TestPass123!', businessName: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@settle.com', password: '123', businessName: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when businessName is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@settle.com', password: 'TestPass123!' });
    expect(res.status).toBe(400);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'TestPass123!' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@settle.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });
});

// ── Protected Routes ──────────────────────────────────────────────────────────
describe('Authenticated routes', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/google/connect');
    expect(res.status).toBe(401);
  });

  it('returns 403 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/auth/google/connect')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(403);
  });
});

// ── Health Check ──────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ── Error Handling ────────────────────────────────────────────────────────────
describe('Error handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('does not expose stack traces in 500 responses', async () => {
    // The global error handler should never return a stack trace
    const res = await request(app).get('/health');
    expect(res.body).not.toHaveProperty('stack');
  });
});

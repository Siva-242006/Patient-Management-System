import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDb } from '../src/db.js';

process.env.NODE_ENV = 'test';
process.env.TODAY_OVERRIDE = '2026-11-09';

describe('Security & Infrastructure Tests', () => {
  let db;
  let app;

  beforeEach(() => {
    db = initDb(':memory:');
    app = createApp({ db, rateLimit: { enabled: false } });
  });

  it('includes security headers from helmet and omits x-powered-by', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);

    // Verify helmet headers
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['x-frame-options']);

    // Verify x-powered-by is removed
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('omits CORS headers (no Access-Control-Allow-Origin header present)', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-site.com');

    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('returns standard JSON 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/unknown-endpoint');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(res.body.error.message, 'Route not found');
  });

  it('handles 500 internal errors without leaking stack traces or SQL details', async () => {
    const originalPrepare = db.prepare;
    db.prepare = () => {
      throw new Error('Sensitive SQLITE database error: table not found at /secret/path');
    };

    try {
      const res = await request(app).get('/patients');
      assert.equal(res.status, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.equal(res.body.error.message, 'Internal server error');

      const bodyString = JSON.stringify(res.body);
      assert.equal(bodyString.includes('SQLITE'), false);
      assert.equal(bodyString.includes('secret'), false);
      assert.equal(bodyString.includes('stack'), false);
    } finally {
      db.prepare = originalPrepare;
    }
  });

  it('rejects SQL injection in name and preserves patients table', async () => {
    const res = await request(app).post('/patients').send({
      name: "Robert'); DROP TABLE patients;--",
      phone: '+919876543210',
      consultationDate: '2026-11-01',
      followUpDate: '2026-11-10'
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');

    // Verify patients table is intact
    const count = db.prepare('SELECT count(*) as count FROM patients').get();
    assert.equal(count.count, 0);
  });

  it('enforces rate limits returning 429 RATE_LIMITED envelope when threshold exceeded', async () => {
    const limitedApp = createApp({
      db,
      rateLimit: { generalMax: 2, writeMax: 1, enabled: true }
    });

    // Request 1: OK
    const res1 = await request(limitedApp).get('/health');
    assert.equal(res1.status, 200);

    // Request 2: OK
    const res2 = await request(limitedApp).get('/health');
    assert.equal(res2.status, 200);

    // Request 3: Exceeded general limit (2)
    const res3 = await request(limitedApp).get('/health');
    assert.equal(res3.status, 429);
    assert.equal(res3.body.success, false);
    assert.equal(res3.body.error.code, 'RATE_LIMITED');
    assert.equal(res3.body.error.message, 'Too many requests, please try again later');
  });

  it('enforces write rate limits returning 429 RATE_LIMITED on POST/PATCH', async () => {
    const limitedApp = createApp({
      db,
      rateLimit: { generalMax: 10, writeMax: 1, enabled: true }
    });

    // Write 1: OK
    const res1 = await request(limitedApp).post('/patients').send({
      name: 'Anita Rao',
      phone: '+919876543210',
      consultationDate: '2026-11-01',
      followUpDate: '2026-11-10'
    });
    assert.equal(res1.status, 201);

    // Write 2: Exceeded write limit (1)
    const res2 = await request(limitedApp).post('/patients').send({
      name: 'Second Patient',
      phone: '+919876543211',
      consultationDate: '2026-11-01',
      followUpDate: '2026-11-10'
    });
    assert.equal(res2.status, 429);
    assert.equal(res2.body.error.code, 'RATE_LIMITED');
  });

  it('enforces generate rate limit returning 429 RATE_LIMITED on POST /drafts/generate', async () => {
    const limitedApp = createApp({
      db,
      rateLimit: { generalMax: 10, writeMax: 10, generateMax: 1, enabled: true },
      aiMode: 'mock'
    });

    // Generate 1: OK
    const res1 = await request(limitedApp).post('/drafts/generate').send({});
    assert.equal(res1.status, 200);

    // Generate 2: Exceeded generate limit (1)
    const res2 = await request(limitedApp).post('/drafts/generate').send({});
    assert.equal(res2.status, 429);
    assert.equal(res2.body.success, false);
    assert.equal(res2.body.error.code, 'RATE_LIMITED');
    assert.equal(res2.body.error.message, 'Too many requests, please try again later');
  });

  it('safety scanner verifies src/ contains no message-sending code or unauthorized HTTP calls', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const prohibitedKeywords = [
      'twilio',
      'whatsapp-web',
      'nodemailer',
      'sendMessage',
      'api.whatsapp.com',
      'wa.me'
    ];

    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');

          // Check prohibited sending keywords
          for (const keyword of prohibitedKeywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            assert.equal(
              regex.test(content),
              false,
              `Found prohibited sending keyword "${keyword}" in file ${fullPath}`
            );
          }

          // Check for unauthorized outbound HTTP calls outside aiService.js
          if (!fullPath.endsWith('aiService.js')) {
            assert.equal(content.includes('fetch('), false, `Unauthorized fetch() call found in ${fullPath}`);
            assert.equal(content.includes('http.request('), false, `Unauthorized http.request found in ${fullPath}`);
            assert.equal(content.includes('https.request('), false, `Unauthorized https.request found in ${fullPath}`);
            assert.equal(content.includes('axios'), false, `Unauthorized axios found in ${fullPath}`);
          }
        }
      }
    }

    scanDir(path.resolve('src'));
  });
});

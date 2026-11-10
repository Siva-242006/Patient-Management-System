import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDb } from '../src/db.js';
import {
  summaryNarrative,
  clearSummaryCache,
  SUMMARY_PROMPT,
  SUMMARY_CACHE_TTL_MS
} from '../src/services/summaryAiService.js';
import { buildSummaryText, computeSummaryCounts } from '../src/services/summaryService.js';

process.env.NODE_ENV = 'test';
process.env.TODAY_OVERRIDE = '2026-11-10';
process.env.AI_MODE = 'mock';

describe('Drafts Summary & Summary AI Narrative', () => {
  let db;
  let app;

  beforeEach(() => {
    clearSummaryCache();
    db = initDb(':memory:');
    app = createApp({ db, rateLimit: { enabled: false }, aiMode: 'mock' });
  });

  describe('summaryNarrative unit tests', () => {
    const sampleCounts = {
      date: '2026-11-10',
      patients: { total: 6, pending: 5, completed: 1, dueToday: 2, overdue: 1 },
      drafts: { total: 3, pendingReview: 1, approved: 1, rejected: 1, cancelled: 0 }
    };

    it('returns summarySource "ai" and the AI text on success', async () => {
      const validAiText = 'On 2026-11-10, 2 patients are due for follow-up and 1 is overdue. 1 draft is pending review, while 1 is approved.';
      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: `"${validAiText}"` }]
              }
            }
          ]
        })
      });

      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'ai');
      assert.equal(res.summaryText, validAiText);
      assert.equal(res.fallbackReason, null);
    });

    it('returns template text and "mock" when AI_MODE="mock"', async () => {
      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'mock',
        apiKey: 'test-api-key'
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'mock_mode');
      assert.equal(res.summaryText, buildSummaryText(sampleCounts));
    });

    it('returns template text and "mock" when API key is missing', async () => {
      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: ''
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'missing_api_key');
      assert.equal(res.summaryText, buildSummaryText(sampleCounts));
    });

    it('returns template text and "mock" on timeout', async () => {
      const fakeFetch = async () => {
        const err = new Error('The operation was aborted');
        err.name = 'TimeoutError';
        throw err;
      };

      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'timeout');
      assert.equal(res.summaryText, buildSummaryText(sampleCounts));
    });

    it('returns template text and "mock" on HTTP 429 error', async () => {
      const fakeFetch = async () => ({
        ok: false,
        status: 429
      });

      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'http 429');
      assert.equal(res.summaryText, buildSummaryText(sampleCounts));
    });

    it('returns template text and "mock" on network error', async () => {
      const fakeFetch = async () => {
        throw new Error('Connection refused');
      };

      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'network_error');
      assert.equal(res.summaryText, buildSummaryText(sampleCounts));
    });

    it('falls back to template when AI text contains a wrong number (e.g. "five follow-ups" when dueToday is 2)', async () => {
      const countsWithoutFive = {
        date: '2026-11-10',
        patients: { total: 4, pending: 3, completed: 1, dueToday: 2, overdue: 1 },
        drafts: { total: 3, pendingReview: 1, approved: 1, rejected: 1, cancelled: 0 }
      };

      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'There are five follow-ups due today for our clinic patients.' }]
              }
            }
          ]
        })
      });

      const res = await summaryNarrative(countsWithoutFive, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'unusable_output');
      assert.equal(res.summaryText, buildSummaryText(countsWithoutFive));
    });

    it('falls back to template when AI text is empty', async () => {
      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '   ' }]
              }
            }
          ]
        })
      });

      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'unusable_output');
    });

    it('falls back to template when AI text is over 400 characters', async () => {
      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Today '.repeat(85) }]
              }
            }
          ]
        })
      });

      const res = await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      assert.equal(res.summarySource, 'mock');
      assert.equal(res.fallbackReason, 'unusable_output');
    });

    it('prompt contains the counts and date but no names, phones or IDs', async () => {
      let capturedBody;

      const fakeFetch = async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'On 2026-11-10, 2 patients are due for follow-up and 1 is overdue.' }]
                }
              }
            ]
          })
        };
      };

      await summaryNarrative(sampleCounts, {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch
      });

      const promptText = capturedBody.contents[0].parts[0].text;
      assert.ok(promptText.includes('2026-11-10'));
      assert.ok(promptText.includes('Total patients: 6'));
      assert.ok(promptText.includes('Due today: 2'));
      assert.ok(promptText.includes('Overdue: 1'));

      // Ensure no patient names, phone numbers, or IDs
      assert.equal(promptText.includes('Anita'), false);
      assert.equal(promptText.includes('+91'), false);
      assert.equal(promptText.includes('patientId'), false);
    });

    it('second call with the same counts returns cached result without calling AI; changed counts do call AI', async () => {
      let callCount = 0;
      let clockTime = 1000;

      const fakeFetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'On 2026-11-10, 2 patients are due for follow-up.' }]
                }
              }
            ]
          })
        };
      };

      const options = {
        aiMode: 'ai',
        apiKey: 'test-api-key',
        fetchFn: fakeFetch,
        cacheTtlMs: 60000,
        now: () => clockTime
      };

      // Call 1: calls fetch
      const res1 = await summaryNarrative(sampleCounts, options);
      assert.equal(callCount, 1);
      assert.equal(res1.summarySource, 'ai');

      // Call 2: same counts within TTL -> cached, no new fetch call
      clockTime += 10000; // 10s later
      const res2 = await summaryNarrative(sampleCounts, options);
      assert.equal(callCount, 1);
      assert.equal(res2.summaryText, res1.summaryText);

      // Call 3: changed counts -> new fetch call
      const changedCounts = {
        ...sampleCounts,
        patients: { ...sampleCounts.patients, dueToday: 3 }
      };
      await summaryNarrative(changedCounts, options);
      assert.equal(callCount, 2);

      // Call 4: after TTL expires -> new fetch call
      clockTime += 65000; // past 60s
      await summaryNarrative(sampleCounts, options);
      assert.equal(callCount, 3);
    });
  });

  describe('GET /drafts/summary integration endpoint', () => {
    beforeEach(() => {
      // Seed patients
      db.prepare(`
        INSERT INTO patients (name, phone, consultation_date, follow_up_date, follow_up_status, completed_at)
        VALUES ('Anita Rao', '+919876543210', '2026-11-01', '2026-11-10', 'pending', NULL),
               ('Diya Patel', '+919876543211', '2026-11-01', '2026-11-08', 'pending', NULL),
               ('Aarav Sharma', '+919876543212', '2026-11-01', '2026-11-10', 'completed', '2026-11-10T00:00:00.000Z')
      `).run();

      // Seed draft
      db.prepare(`
        INSERT INTO drafts (patient_id, follow_up_date, message, source, status)
        VALUES (1, '2026-11-10', 'Hello Anita, this is a follow-up reminder from the clinic regarding your upcoming visit. Please take care!', 'mock', 'pending_review')
      `).run();
    });

    it('returns 200 with standard envelope and accurate counts in mock mode', async () => {
      const res = await request(app).get('/drafts/summary');

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Summary retrieved');

      const data = res.body.data;
      assert.equal(data.date, '2026-11-10');
      assert.equal(data.patients.total, 3);
      assert.equal(data.patients.pending, 2);
      assert.equal(data.patients.completed, 1);
      assert.equal(data.patients.dueToday, 1);
      assert.equal(data.patients.overdue, 1);

      assert.equal(data.drafts.total, 1);
      assert.equal(data.drafts.pendingReview, 1);
      assert.equal(data.drafts.approved, 0);
      assert.equal(data.drafts.rejected, 0);
      assert.equal(data.drafts.cancelled, 0);

      assert.equal(data.summarySource, 'mock');
      assert.ok(typeof data.summaryText === 'string');
      assert.ok(data.summaryText.length > 0);
      assert.equal(data.fallbackReason, 'mock_mode');
    });

    it('counts are identical in ai and mock responses', async () => {
      const mockRes = await request(app).get('/drafts/summary');

      clearSummaryCache();
      const validText = 'On 2026-11-10, 1 patient is due for follow-up and 1 is overdue.';
      const aiApp = createApp({
        db,
        rateLimit: { enabled: false },
        aiOptions: {
          aiMode: 'ai',
          apiKey: 'key',
          fetchFn: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: validText }] } }]
            })
          })
        }
      });

      const aiRes = await request(aiApp).get('/drafts/summary');
      assert.equal(aiRes.status, 200);
      assert.equal(aiRes.body.data.summarySource, 'ai');
      assert.equal(aiRes.body.data.summaryText, validText);
      assert.equal(aiRes.body.data.fallbackReason, null);

      assert.deepEqual(aiRes.body.data.patients, mockRes.body.data.patients);
      assert.deepEqual(aiRes.body.data.drafts, mockRes.body.data.drafts);
    });

    it('rejects unknown query parameters with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).get('/drafts/summary?filter=today');

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'query');
    });

    it('ensures GET /drafts/summary is not treated as a draft id', async () => {
      const res = await request(app).get('/drafts/summary');
      assert.equal(res.status, 200);
      assert.notEqual(res.body.error?.code, 'NOT_FOUND');
    });
  });
});

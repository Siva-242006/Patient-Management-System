import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLLOW_UP_PROMPT,
  validateAiMode,
  getFirstName,
  getMockDraft,
  sanitizeModelOutput,
  generateDraft
} from '../src/services/aiService.js';
import { MESSAGE_MIN, MESSAGE_MAX, MAX_OUTPUT_TOKENS } from '../src/utils/constants.js';

describe('AI Service & Prompt Safety Tests', () => {
  describe('AI_MODE validation', () => {
    it('accepts "ai" and "mock"', () => {
      assert.equal(validateAiMode('ai'), 'ai');
      assert.equal(validateAiMode('mock'), 'mock');
    });

    it('throws fast when AI_MODE is invalid', () => {
      assert.throws(() => {
        validateAiMode('invalid_mode');
      }, /Invalid AI_MODE: "invalid_mode"/);

      assert.throws(() => {
        validateAiMode('production');
      }, /Invalid AI_MODE: "production"/);
    });
  });

  describe('First name extraction', () => {
    it('extracts first name correctly for "Seán O\'Neil"', () => {
      assert.equal(getFirstName("Seán O'Neil"), 'Seán');
    });

    it('extracts first name correctly for "Mary-Jane Rao"', () => {
      assert.equal(getFirstName('Mary-Jane Rao'), 'Mary-Jane');
    });

    it('extracts first name correctly for single names and extra whitespace', () => {
      assert.equal(getFirstName('Anita'), 'Anita');
      assert.equal(getFirstName('  Ramesh   Kumar  '), 'Ramesh');
    });
  });

  describe('Deterministic Mock Template', () => {
    it('returns standard mock text with first name and date', () => {
      const template = getMockDraft('Anita', '2026-11-15');
      assert.equal(
        template,
        'Hello Anita, this is a gentle reminder from the clinic about your follow-up visit on 2026-11-15. Please reply to confirm a convenient time or to reschedule. Take care!'
      );
    });

    it('guarantees length within range for every valid first name (2 to 100 characters)', () => {
      const minMock = getMockDraft('An', '2026-11-15');
      assert.ok(minMock.length >= MESSAGE_MIN, `Expected >= ${MESSAGE_MIN}, got ${minMock.length}`);
      assert.ok(minMock.length <= MESSAGE_MAX, `Expected <= ${MESSAGE_MAX}, got ${minMock.length}`);

      const maxMock = getMockDraft('A'.repeat(100), '2026-11-15');
      assert.ok(maxMock.length >= MESSAGE_MIN, `Expected >= ${MESSAGE_MIN}, got ${maxMock.length}`);
      assert.ok(maxMock.length <= MESSAGE_MAX, `Expected <= ${MESSAGE_MAX}, got ${maxMock.length}`);
    });
  });

  describe('Sanitizer & Output Post-Processing', () => {
    it('strips surrounding double, single, and backtick quotes', () => {
      const validText = 'Hello Anita, please confirm your appointment! '.repeat(3).slice(0, MESSAGE_MIN);
      assert.equal(sanitizeModelOutput(`"${validText}"`), validText);
      assert.equal(sanitizeModelOutput(`'${validText}'`), validText);
      assert.equal(sanitizeModelOutput(`\`${validText}\``), validText);
    });

    it('strips control characters except newlines and collapses spaces', () => {
      const raw = 'Hello \x00\x08Anita,    welcome\nto our clinic! Please reply to confirm a convenient time or to reschedule your visit. Take care and stay well!';
      const sanitized = sanitizeModelOutput(raw);
      assert.ok(sanitized);
      assert.equal(sanitized.includes('\x00'), false);
      assert.equal(sanitized.includes('\x08'), false);
      assert.equal(sanitized.includes('    '), false);
      assert.ok(sanitized.includes('Anita, welcome'));
      assert.ok(sanitized.includes('\n'));
    });

    it('rejects output shorter than MESSAGE_MIN or longer than MESSAGE_MAX', () => {
      assert.equal(sanitizeModelOutput('A'.repeat(MESSAGE_MIN - 1)), null);
      assert.equal(sanitizeModelOutput('A'.repeat(MESSAGE_MAX + 1)), null);
      assert.equal(sanitizeModelOutput('A'.repeat(MESSAGE_MIN)), 'A'.repeat(MESSAGE_MIN));
      assert.equal(sanitizeModelOutput('A'.repeat(MESSAGE_MAX)), 'A'.repeat(MESSAGE_MAX));
    });

    it('rejects output containing no letters', () => {
      assert.equal(sanitizeModelOutput('1'.repeat(MESSAGE_MIN)), null);
      assert.equal(sanitizeModelOutput('!'.repeat(MESSAGE_MIN)), null);
    });
  });

  describe('generateDraft execution with injectable client', () => {
    it('returns source: "ai" with sanitized message when client succeeds', async () => {
      let capturedUrl;
      let capturedHeaders;
      let capturedBody;

      const validAiText = 'Hello Anita, your follow-up appointment is scheduled for 2026-11-15. Please reply to confirm! 😊 Take care.';
      assert.ok(validAiText.length >= MESSAGE_MIN && validAiText.length <= MESSAGE_MAX);

      const fakeFetch = async (url, options) => {
        capturedUrl = url;
        capturedHeaders = options.headers;
        capturedBody = JSON.parse(options.body);

        return {
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
        };
      };

      const result = await generateDraft(
        { firstName: 'Anita', followUpDate: '2026-11-15' },
        {
          aiMode: 'ai',
          apiKey: 'fake-test-key-12345',
          model: 'gemini-2.5-flash',
          fetchFn: fakeFetch
        }
      );

      assert.equal(result.source, 'ai');
      assert.equal(result.message, validAiText);

      // Verify header authentication and that key is NOT in URL
      assert.equal(capturedHeaders['x-goog-api-key'], 'fake-test-key-12345');
      assert.equal(capturedUrl.includes('fake-test-key-12345'), false);

      // Verify prompt content safety: contains firstName and date
      const promptText = capturedBody.contents[0].parts[0].text;
      assert.ok(promptText.includes('Anita'));
      assert.ok(promptText.includes('2026-11-15'));

      // Verify prompt NEVER contains phone, full name, or ID
      assert.equal(promptText.includes('+91'), false);
      assert.equal(promptText.includes('patientId'), false);

      // Verify generationConfig maxOutputTokens and thinkingBudget: 0
      assert.equal(capturedBody.generationConfig?.maxOutputTokens, MAX_OUTPUT_TOKENS);
      assert.equal(capturedBody.generationConfig?.thinkingConfig?.thinkingBudget, 0);
    });

    it('strips "models/" prefix when model name has it and assembles multi-part text chunks', async () => {
      let capturedUrl;
      const part1 = 'Hello Anita! This is a gentle reminder from the clinic regarding your follow-up ';
      const part2 = 'visit on 2026-11-15. Please reply to confirm or reschedule. Take care!';
      const expectedText = part1 + part2;
      assert.ok(expectedText.length >= MESSAGE_MIN && expectedText.length <= MESSAGE_MAX);

      const fakeFetch = async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    { text: part1 },
                    { text: part2, thoughtSignature: 'sig123' }
                  ]
                }
              }
            ]
          })
        };
      };

      const result = await generateDraft(
        { firstName: 'Anita', followUpDate: '2026-11-15' },
        {
          aiMode: 'ai',
          apiKey: 'fake-test-key-12345',
          model: 'models/gemini-3.5-flash',
          fetchFn: fakeFetch
        }
      );

      assert.equal(result.source, 'ai');
      assert.equal(result.message, expectedText);
      assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    });

    it('falls back to mock when AI output is exactly 99 characters', async () => {
      const shortText = 'A'.repeat(MESSAGE_MIN - 1);
      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: shortText }] } }]
        })
      });

      const result = await generateDraft(
        { firstName: 'Anita', followUpDate: '2026-11-15' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Anita'));
    });

    it('accepts AI output of exactly MESSAGE_MIN (100) characters as source="ai"', async () => {
      const exactMinText = 'Hello Anita, this text is constructed so that its length is precisely one hundred characters long ok';
      assert.equal(exactMinText.length, MESSAGE_MIN);

      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: exactMinText }] } }]
        })
      });

      const result = await generateDraft(
        { firstName: 'Anita', followUpDate: '2026-11-15' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'ai');
      assert.equal(result.message, exactMinText);
    });

    it('accepts AI output of exactly MESSAGE_MAX (500) characters as source="ai"', async () => {
      const exactMaxText = 'Hello Anita! ' + 'A'.repeat(MESSAGE_MAX - 13);
      assert.equal(exactMaxText.length, MESSAGE_MAX);

      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: exactMaxText }] } }]
        })
      });

      const result = await generateDraft(
        { firstName: 'Anita', followUpDate: '2026-11-15' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'ai');
      assert.equal(result.message, exactMaxText);
    });

    it('falls back to mock when AI output is 501 characters', async () => {
      const longText = 'Hello Anita! ' + 'A'.repeat(MESSAGE_MAX - 12);
      assert.equal(longText.length, MESSAGE_MAX + 1);

      const fakeFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: longText }] } }]
        })
      });

      const result = await generateDraft(
        { firstName: 'Anita', followUpDate: '2026-11-15' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Anita'));
    });

    it('falls back to mock when apiKey is missing', async () => {
      const result = await generateDraft(
        { firstName: 'Diya', followUpDate: '2026-11-10' },
        { aiMode: 'ai', apiKey: '', model: 'gemini-2.5-flash' }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Diya'));
    });

    it('falls back to mock when AI_MODE is "mock"', async () => {
      const result = await generateDraft(
        { firstName: 'Diya', followUpDate: '2026-11-10' },
        { aiMode: 'mock', apiKey: 'fake-key', model: 'gemini-2.5-flash' }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Diya'));
    });

    it('falls back to mock when client throws network error', async () => {
      const fakeFetch = async () => {
        throw new Error('Network unreachable');
      };

      const result = await generateDraft(
        { firstName: 'Rohan', followUpDate: '2026-11-08' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Rohan'));
    });

    it('falls back to mock when client times out', async () => {
      const fakeFetch = async () => {
        const timeoutErr = new Error('The operation was aborted');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      const result = await generateDraft(
        { firstName: 'Rohan', followUpDate: '2026-11-08' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Rohan'));
    });

    it('falls back to mock when client returns non-200 status (e.g. 429)', async () => {
      const fakeFetch = async () => ({
        ok: false,
        status: 429
      });

      const result = await generateDraft(
        { firstName: 'Vikram', followUpDate: '2026-11-16' },
        { aiMode: 'ai', apiKey: 'fake-key', model: 'gemini-2.5-flash', fetchFn: fakeFetch }
      );

      assert.equal(result.source, 'mock');
      assert.ok(result.message.includes('Hello Vikram'));
    });
  });
});

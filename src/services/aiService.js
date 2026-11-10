import { MESSAGE_MIN, MESSAGE_MAX, MAX_OUTPUT_TOKENS } from '../utils/constants.js';

export const FOLLOW_UP_PROMPT = `You are a friendly clinic assistant writing a short WhatsApp follow-up reminder to a patient.

Patient first name: {firstName}
Follow-up date: {followUpDate}

Strict Guidelines:
1. Use ONLY the patient's first name and follow-up date provided above. Do NOT invent doctor names, clinic names, appointment times, or medical details.
2. About 40 to 60 words. Warm, plain language. At most one emoji.
3. Absolutely NO medical advice, diagnosis, treatment, or medication instructions.
4. Ask the patient to reply to confirm a convenient time or to reschedule.
5. Output ONLY the message text itself: no quotes, no conversational preamble, no markdown, no placeholders.`;

export function validateAiMode(mode = process.env.AI_MODE || 'ai') {
  if (mode !== 'ai' && mode !== 'mock') {
    throw new Error(`Invalid AI_MODE: "${mode}". Must be "ai" or "mock".`);
  }
  return mode;
}

export function getFirstName(fullName) {
  if (typeof fullName !== 'string') return '';
  return fullName.trim().split(' ')[0] || '';
}

export function getMockDraft(firstName, followUpDate) {
  return `Hello ${firstName}, this is a gentle reminder from the clinic about your follow-up visit on ${followUpDate}. Please reply to confirm a convenient time or to reschedule. Take care!`;
}

export function sanitizeModelOutput(text) {
  if (typeof text !== 'string') return null;
  let cleaned = text.trim();

  // Strip surrounding quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('`') && cleaned.endsWith('`'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip control characters except newline and carriage return
  cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Collapse runs of spaces within lines
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Enforce boundary rules: MESSAGE_MIN to MESSAGE_MAX characters and must contain letters
  if (cleaned.length < MESSAGE_MIN || cleaned.length > MESSAGE_MAX || !/\p{L}/u.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export async function generateDraft({ firstName, followUpDate }, options = {}) {
  const aiMode = validateAiMode(options.aiMode || process.env.AI_MODE || 'ai');
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const model = options.model || process.env.GEMINI_MODEL;
  const fetchFn = options.fetchFn || globalThis.fetch;

  // Use mock fallback if mock mode or missing API key
  if (aiMode === 'mock' || !apiKey) {
    return {
      message: getMockDraft(firstName, followUpDate),
      source: 'mock'
    };
  }

  const prompt = FOLLOW_UP_PROMPT
    .replace('{firstName}', firstName)
    .replace('{followUpDate}', followUpDate);

  try {
    const cleanModel = model ? model.replace(/^models\//, '') : '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`;
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      if (process.env.NODE_ENV !== 'test') {
        let reason = `http ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            reason += ` - ${errData.error.message}`;
          }
        } catch {
          // ignore error body parse failure
        }
        console.error(`AI call failed: ${reason}`);
      }
      return {
        message: getMockDraft(firstName, followUpDate),
        source: 'mock'
      };
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts.map((p) => p.text || '').join('');
    const sanitized = sanitizeModelOutput(rawText);

    if (!sanitized) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('AI call failed: output validation');
      }
      return {
        message: getMockDraft(firstName, followUpDate),
        source: 'mock'
      };
    }

    return {
      message: sanitized,
      source: 'ai'
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      const reason = err.name === 'TimeoutError' ? 'timeout' : 'error';
      console.error(`AI call failed: ${reason}`);
    }
    return {
      message: getMockDraft(firstName, followUpDate),
      source: 'mock'
    };
  }
}

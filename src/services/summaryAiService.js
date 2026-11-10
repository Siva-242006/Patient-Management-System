import { validateAiMode } from './aiService.js';
import { buildSummaryText } from './summaryService.js';

export const SUMMARY_CACHE_TTL_MS = 60 * 1000;

export const SUMMARY_PROMPT = `You are a clinic assistant writing a brief daily status update for clinic staff.

Date: {date}
Patient counts:
- Total patients: {patientsTotal}
- Pending follow-up: {patientsPending}
- Completed follow-up: {patientsCompleted}
- Due today: {patientsDueToday}
- Overdue: {patientsOverdue}

Draft counts:
- Total drafts: {draftsTotal}
- Pending review: {draftsPendingReview}
- Approved: {draftsApproved}
- Rejected: {draftsRejected}
- Cancelled: {draftsCancelled}

Strict Rules:
1. Write 2 to 3 short sentences in plain English for clinic staff.
2. Under 60 words.
3. Use ONLY the supplied numbers and date above. Do NOT invent names, medical advice, patient details, or any other numbers.
4. Output ONLY the summary text itself: no quotes, no markdown, no conversational preamble.`;

const summaryCache = new Map();

export function clearSummaryCache() {
  summaryCache.clear();
}

function getCacheKey({ date, patients, drafts }) {
  return [
    date,
    patients?.total ?? 0,
    patients?.pending ?? 0,
    patients?.completed ?? 0,
    patients?.dueToday ?? 0,
    patients?.overdue ?? 0,
    drafts?.total ?? 0,
    drafts?.pendingReview ?? 0,
    drafts?.approved ?? 0,
    drafts?.rejected ?? 0,
    drafts?.cancelled ?? 0
  ].join(':');
}

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100
};

export function sanitizeSummaryOutput(text, { date, patients, drafts }) {
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

  // Strip control characters except newline
  cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Collapse whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Empty or over 400 characters
  if (cleaned.length === 0 || cleaned.length > 400) {
    return null;
  }

  // Collect all valid allowed numbers from counts and date
  const allowedNumbers = new Set();

  for (const val of Object.values(patients || {})) {
    if (typeof val === 'number') allowedNumbers.add(val);
  }
  for (const val of Object.values(drafts || {})) {
    if (typeof val === 'number') allowedNumbers.add(val);
  }
  if (typeof date === 'string') {
    const parts = date.split('-').map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
    for (const p of parts) {
      allowedNumbers.add(p);
    }
  }

  // Check digit numbers in text
  const digitMatches = cleaned.match(/\b\d+\b/g) || [];
  for (const match of digitMatches) {
    const num = parseInt(match, 10);
    if (!allowedNumbers.has(num)) {
      return null;
    }
  }

  // Check number words in text
  const wordMatches = cleaned.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi) || [];
  for (const match of wordMatches) {
    const num = NUMBER_WORDS[match.toLowerCase()];
    if (num !== undefined && !allowedNumbers.has(num)) {
      return null;
    }
  }

  return cleaned;
}

export async function summaryNarrative({ date, patients, drafts }, options = {}) {
  const cacheKey = getCacheKey({ date, patients, drafts });
  const ttl = options.cacheTtlMs ?? SUMMARY_CACHE_TTL_MS;
  const now = typeof options.now === 'function' ? options.now() : Date.now();

  const cached = summaryCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return { ...cached.data };
  }

  const saveToCache = (result) => {
    summaryCache.set(cacheKey, {
      data: result,
      expiresAt: now + ttl
    });
    return result;
  };

  const makeFallback = (reason) => {
    if (process.env.NODE_ENV !== 'test' || options.logInTest) {
      console.error(`Summary fallback: ${reason}`);
    }
    const result = {
      summaryText: buildSummaryText({ date, patients, drafts }),
      summarySource: 'mock',
      fallbackReason: reason
    };
    return saveToCache(result);
  };

  const aiMode = validateAiMode(options.aiMode || process.env.AI_MODE || 'ai');
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
  const model = options.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fetchFn = options.fetchFn || globalThis.fetch;

  if (aiMode === 'mock') {
    return makeFallback('mock_mode');
  }

  if (!apiKey) {
    return makeFallback('missing_api_key');
  }

  const prompt = SUMMARY_PROMPT
    .replace('{date}', date)
    .replace('{patientsTotal}', patients?.total ?? 0)
    .replace('{patientsPending}', patients?.pending ?? 0)
    .replace('{patientsCompleted}', patients?.completed ?? 0)
    .replace('{patientsDueToday}', patients?.dueToday ?? 0)
    .replace('{patientsOverdue}', patients?.overdue ?? 0)
    .replace('{draftsTotal}', drafts?.total ?? 0)
    .replace('{draftsPendingReview}', drafts?.pendingReview ?? 0)
    .replace('{draftsApproved}', drafts?.approved ?? 0)
    .replace('{draftsRejected}', drafts?.rejected ?? 0)
    .replace('{draftsCancelled}', drafts?.cancelled ?? 0);

  try {
    const cleanModel = model.replace(/^models\//, '');
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
          maxOutputTokens: 150,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return makeFallback(`http ${response.status}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts.map((p) => p.text || '').join('');
    const sanitized = sanitizeSummaryOutput(rawText, { date, patients, drafts });

    if (!sanitized) {
      return makeFallback('unusable_output');
    }

    return saveToCache({
      summaryText: sanitized,
      summarySource: 'ai',
      fallbackReason: null
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timeout' : 'network_error';
    return makeFallback(reason);
  }
}

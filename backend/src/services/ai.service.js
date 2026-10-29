// This file is the ONLY place in the backend that talks to the Gemini API.
// Keeping all AI logic in one file means if you ever want to change the prompt,
// switch models, or add logging, you only touch this file.

const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// One model for both question generation and feedback. Set GEMINI_MODEL to
// override it; unset, empty or blank uses the default. gemini-3.6-flash is
// Google's stable previous-generation Flash model; the newest one gave
// "high demand" 503 errors on the free tier elsewhere.
const DEFAULT_MODEL = 'gemini-3.6-flash';

// Read on every call (not once at load) so it doesn't depend on when
// dotenv runs, and so the test can change it between calls.
function getModel() {
  return (process.env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL;
}

// Tried once when the main model is overloaded, out of quota or times out. Set
// GEMINI_FALLBACK_MODEL to override it; unset, empty or blank uses the default.
const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

function getFallbackModel() {
  return (process.env.GEMINI_FALLBACK_MODEL || '').trim() || DEFAULT_FALLBACK_MODEL;
}

const RETRY_DELAY_MS = 2000;
// Per attempt. Three attempts plus the retry wait (77 s at most) stay under
// Cloudflare's 100 s limit in front of Render. For streaming this only covers
// the wait for the first chunk, so a long answer is never cut off.
const ATTEMPT_TIMEOUT_MS = 25000;

// Node's own fetch timeouts, which can arrive before ours does.
const NETWORK_TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

// What went wrong, as used in the log line: 'timeout', Google's HTTP status
// (503, 429, 400...), or 'error' for anything else (e.g. a network failure).
function failureKind(err, signal) {
  if (signal.aborted) return 'timeout';
  const code = err.code || (err.cause && err.cause.code);
  if (NETWORK_TIMEOUT_CODES.has(code)) return 'timeout';
  return typeof err.status === 'number' ? err.status : 'error';
}

function logAttempt(model, attempt, outcome, startedAt) {
  console.log(`[gemini] ${model} attempt ${attempt}: ${outcome} in ${Date.now() - startedAt}ms`);
}

/**
 * Runs one Gemini request, retrying temporary failures:
 *   503 or timeout: wait 2 s, try the main model again, then the fallback.
 *   429 (quota): skip the retry and go straight to the fallback.
 *   anything else: throw at once, as before.
 *
 * run(model, signal, gotResponse) makes the actual call. It must pass signal
 * to the SDK, and may call gotResponse() to stop the timeout early (streaming
 * does this on the first chunk). canRetry() returning false (text already sent
 * to the client) makes any failure final.
 */
async function withRetries(run, canRetry = () => true) {
  const mainModel = getModel();
  const fallbackModel = getFallbackModel();
  let attempt = 0;

  async function tryModel(model) {
    attempt += 1;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const value = await run(model, controller.signal, () => clearTimeout(timer));
      logAttempt(model, attempt, 'ok', startedAt);
      return { ok: true, value };
    } catch (err) {
      const kind = failureKind(err, controller.signal);
      const outcome = canRetry() ? kind : `${kind} after streaming started`;
      logAttempt(model, attempt, outcome, startedAt);
      return { ok: false, err, kind };
    } finally {
      clearTimeout(timer);
    }
  }

  let result = await tryModel(mainModel);
  if (result.ok) return result.value;

  const isTemporary = (kind) => kind === 503 || kind === 429 || kind === 'timeout';
  if (!canRetry() || !isTemporary(result.kind)) throw result.err;

  if (result.kind !== 429) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    result = await tryModel(mainModel);
    if (result.ok) return result.value;
    if (!canRetry() || !isTemporary(result.kind)) throw result.err;
  }

  // Same model as the main one: it has just failed, don't call it again.
  if (fallbackModel === mainModel) throw result.err;

  result = await tryModel(fallbackModel);
  if (result.ok) return result.value;
  throw result.err;
}

/**
 * Generates 5 interview questions for a given role and experience level.
 * Returns an array like:
 * [{ questionText: "...", category: "behavioral" }, ...]
 */
async function generateQuestions(role, experienceLevel) {
  const prompt = `You are a senior technical interviewer. Generate exactly 5 interview questions for a ${experienceLevel} ${role} candidate. Mix 2 behavioral, 2 technical, and 1 system-design question (if the role doesn't fit system design, replace it with a third technical question). Respond with ONLY a valid JSON array, no other text, no markdown formatting, no code fences. Format: [{"questionText": "...", "category": "behavioral"}, {"questionText": "...", "category": "technical"}]`;

  const response = await withRetries((model, signal) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: { abortSignal: signal },
    })
  );

  const rawText = response.text;

  // Defensive parsing: strip any accidental markdown code fences before parsing JSON.
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('AI returned invalid JSON for questions: ' + rawText);
  }

  return questions;
}

/**
 * Streams AI feedback for a single answer directly to the HTTP response object.
 * This makes the feedback appear "typed out" live on the frontend instead of
 * waiting for the whole response to finish generating.
 *
 * res = the Express response object, passed in from the controller.
 */
async function streamFeedback(questionText, answerText, res) {
  const prompt = `You are an experienced interview coach. The candidate was asked: "${questionText}". Their answer was: "${answerText}". Give constructive feedback covering clarity, structure (mention the STAR method if this is a behavioral question), and correctness/depth if technical. Keep it to 3-4 short sentences. Then on new lines, output exactly these three lines with numeric scores out of 10: SCORE_CLARITY:<number> SCORE_STRUCTURE:<number> SCORE_CONTENT:<number>`;

  // Set headers so the browser knows to expect a stream of text chunks
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullText = '';
  // Once any text reaches the client, a failure is final: retrying would
  // send duplicated or mixed text.
  let textSent = false;

  try {
    await withRetries(
      async (model, signal, gotResponse) => {
        const streamResult = await ai.models.generateContentStream({
          model,
          contents: prompt,
          config: { abortSignal: signal },
        });

        // Gemini's stream yields chunks one at a time; each chunk has .text
        for await (const chunk of streamResult) {
          gotResponse();
          const textChunk = chunk.text || '';
          fullText += textChunk;
          if (textChunk) textSent = true;
          res.write(`data: ${JSON.stringify({ chunk: textChunk })}\n\n`);
        }
      },
      () => !textSent
    );

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    // Log the real, detailed error server-side (visible in Render's logs)
    // so we can debug it — but never send raw internal error text to the
    // browser. The frontend shows its own generic, friendly message
    // regardless of what we send here; this field is really just a signal
    // that something went wrong, not user-facing copy.
    console.error("Gemini streaming error:", err.message);
    res.write(`data: ${JSON.stringify({ error: "generation_failed" })}\n\n`);
    res.end();
  }

  return fullText;
}

/**
 * Pulls the SCORE_CLARITY / SCORE_STRUCTURE / SCORE_CONTENT numbers out of
 * the raw AI feedback text so they can be saved as separate columns in the DB.
 */
function extractScores(feedbackText) {
  const clarityMatch = feedbackText.match(/SCORE_CLARITY:\s*(\d+(\.\d+)?)/i);
  const structureMatch = feedbackText.match(/SCORE_STRUCTURE:\s*(\d+(\.\d+)?)/i);
  const contentMatch = feedbackText.match(/SCORE_CONTENT:\s*(\d+(\.\d+)?)/i);

  return {
    clarityScore: clarityMatch ? parseFloat(clarityMatch[1]) : null,
    structureScore: structureMatch ? parseFloat(structureMatch[1]) : null,
    contentScore: contentMatch ? parseFloat(contentMatch[1]) : null,
  };
}

module.exports = {
  generateQuestions,
  streamFeedback,
  extractScores,
};
// Checks the Gemini retry and fallback rules in ai.service.js.
// Run with: npm run test:retry
//
// No database, no server and no real Gemini calls: the SDK's GoogleGenAI class
// is replaced with a fake before ai.service.js loads. Each test gives the fake
// a script, one step per call (fail with a status, time out, or succeed), and
// checks which models were called and what reached the client.
// Retries use the real 2 s wait, so this takes about 20 seconds.

const genai = require('@google/genai');

const { ApiError } = genai;

let script = [];
let calledModels = [];

// The next scripted step for a call to `model`.
function nextStep(model) {
  calledModels.push(model);
  const step = script.shift();
  if (!step) throw new Error('Unexpected extra Gemini call');
  if (step.status) throw new ApiError({ message: `fake ${step.status}`, status: step.status });
  if (step.timeout) {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'UND_ERR_HEADERS_TIMEOUT' };
    throw err;
  }
  return step;
}

genai.GoogleGenAI = class FakeGoogleGenAI {
  constructor() {
    this.models = {
      generateContent: async ({ model }) => {
        const step = nextStep(model);
        return { text: step.text };
      },
      generateContentStream: async ({ model }) => {
        const step = nextStep(model);
        return (async function* () {
          for (const text of step.chunks) yield { text };
          if (step.thenStatus) {
            throw new ApiError({ message: `fake ${step.thenStatus}`, status: step.thenStatus });
          }
        })();
      },
    };
  }
};

const { generateQuestions, streamFeedback } = require('../src/services/ai.service');

const MAIN = 'gemini-3.6-flash';
const FALLBACK = 'gemini-3.5-flash-lite';
const QUESTIONS_JSON = '[{"questionText": "Q?", "category": "technical"}]';
const FEEDBACK = 'Good answer. SCORE_CLARITY:7 SCORE_STRUCTURE:7 SCORE_CONTENT:7';

// Collect the "[gemini] ..." attempt lines instead of printing them, and
// silence the "Gemini streaming error:" line the failure tests trigger.
let logLines = [];
const realLog = console.log;
const realError = console.error;
console.log = (...args) => {
  const line = args.join(' ');
  if (line.startsWith('[gemini]')) logLines.push(line);
  else realLog(...args);
};
console.error = (...args) => {
  if (!String(args[0]).startsWith('Gemini streaming error:')) realError(...args);
};

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    realLog(`  PASS  ${name}`);
  } else {
    failed += 1;
    realLog(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// Just enough of an Express response for streamFeedback; keeps every event.
function fakeRes() {
  const events = [];
  return {
    events,
    setHeader() {},
    write(text) {
      events.push(JSON.parse(text.replace(/^data: /, '')));
    },
    end() {
      events.push('end');
    },
  };
}

function reset(steps) {
  script = steps;
  calledModels = [];
  logLines = [];
}

// Runs generateQuestions with a script; returns { value, err, ms }.
async function runQuestions(steps) {
  reset(steps);
  const startedAt = Date.now();
  try {
    const value = await generateQuestions('Backend Engineer', 'mid');
    return { value, ms: Date.now() - startedAt };
  } catch (err) {
    return { err, ms: Date.now() - startedAt };
  }
}

// Runs streamFeedback with a script; returns { text, events }.
async function runStream(steps) {
  reset(steps);
  const res = fakeRes();
  const text = await streamFeedback('Q?', 'My answer.', res);
  return { text, events: res.events };
}

const ok = { text: QUESTIONS_JSON };
const streamOk = { chunks: ['Good answer. ', 'SCORE_CLARITY:7 SCORE_STRUCTURE:7 SCORE_CONTENT:7'] };
const STREAM_OK_EVENTS = [
  { chunk: 'Good answer. ' },
  { chunk: 'SCORE_CLARITY:7 SCORE_STRUCTURE:7 SCORE_CONTENT:7' },
  { done: true },
  'end',
];
const STREAM_FAILED_EVENTS = [{ error: 'generation_failed' }, 'end'];
const LOG_FORMAT = /^\[gemini\] \S+ attempt [1-3]: \S.* in \d+ms$/;
let allLogLines = [];

async function main() {
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODEL;

  realLog('\n1. 503, then success on the same model');
  {
    const r = await runQuestions([{ status: 503 }, ok]);
    check('questions: models [main, main]', same(calledModels, [MAIN, MAIN]), calledModels.join(', '));
    check('questions: returns the questions', !r.err && r.value?.[0]?.questionText === 'Q?', r.err?.message);
    check('questions: waited about 2 s before the retry', r.ms >= 1900, `${r.ms}ms`);
    check('questions: log says 503 then ok', /attempt 1: 503 in/.test(logLines[0]) && /attempt 2: ok in/.test(logLines[1]), logLines.join(' | '));
    allLogLines.push(...logLines);

    const s = await runStream([{ status: 503 }, streamOk]);
    check('stream: models [main, main]', same(calledModels, [MAIN, MAIN]), calledModels.join(', '));
    check('stream: client gets the text once, then done', same(s.events, STREAM_OK_EVENTS), JSON.stringify(s.events));
    check('stream: returns the full text', s.text === FEEDBACK, s.text);
    allLogLines.push(...logLines);
  }

  realLog('\n2. 503 twice, then the fallback model');
  {
    const r = await runQuestions([{ status: 503 }, { status: 503 }, ok]);
    check('questions: models [main, main, fallback]', same(calledModels, [MAIN, MAIN, FALLBACK]), calledModels.join(', '));
    check('questions: returns the questions', !r.err && r.value?.[0]?.questionText === 'Q?', r.err?.message);
    check('questions: log names the fallback on attempt 3', logLines[2]?.startsWith(`[gemini] ${FALLBACK} attempt 3: ok in`), logLines[2]);
    allLogLines.push(...logLines);

    const s = await runStream([{ status: 503 }, { status: 503 }, streamOk]);
    check('stream: models [main, main, fallback]', same(calledModels, [MAIN, MAIN, FALLBACK]), calledModels.join(', '));
    check('stream: client gets the text once, then done', same(s.events, STREAM_OK_EVENTS), JSON.stringify(s.events));
    allLogLines.push(...logLines);
  }

  realLog('\n3. 429 skips the same-model retry');
  {
    const r = await runQuestions([{ status: 429 }, ok]);
    check('questions: models exactly [main, fallback]', same(calledModels, [MAIN, FALLBACK]), calledModels.join(', '));
    check('questions: returns the questions', !r.err && r.value?.[0]?.questionText === 'Q?', r.err?.message);
    check('questions: no 2 s wait', r.ms < 1000, `${r.ms}ms`);
    allLogLines.push(...logLines);

    const s = await runStream([{ status: 429 }, streamOk]);
    check('stream: models exactly [main, fallback]', same(calledModels, [MAIN, FALLBACK]), calledModels.join(', '));
    check('stream: client gets the text once, then done', same(s.events, STREAM_OK_EVENTS), JSON.stringify(s.events));
    allLogLines.push(...logLines);

    await runQuestions([{ status: 503 }, { status: 429 }, ok]);
    check('503 then 429 on the retry -> fallback next', same(calledModels, [MAIN, MAIN, FALLBACK]), calledModels.join(', '));
    allLogLines.push(...logLines);
  }

  realLog('\n4. A timeout counts as temporary');
  {
    const r = await runQuestions([{ timeout: true }, ok]);
    check('questions: models [main, main]', same(calledModels, [MAIN, MAIN]), calledModels.join(', '));
    check('questions: log says timeout', /attempt 1: timeout in/.test(logLines[0]), logLines[0]);
    check('questions: returns the questions', !r.err, r.err?.message);
    allLogLines.push(...logLines);

    const s = await runStream([{ timeout: true }, streamOk]);
    check('stream: models [main, main]', same(calledModels, [MAIN, MAIN]), calledModels.join(', '));
    check('stream: client gets the text once, then done', same(s.events, STREAM_OK_EVENTS), JSON.stringify(s.events));
    allLogLines.push(...logLines);
  }

  realLog('\n5. Everything fails: same error as today');
  {
    const r = await runQuestions([{ status: 503 }, { status: 503 }, { status: 503 }]);
    check('questions: 3 attempts', same(calledModels, [MAIN, MAIN, FALLBACK]), calledModels.join(', '));
    check('questions: throws the last Gemini error (error handler sends the fixed 500)', r.err?.status === 503 && r.err?.statusCode === undefined, r.err?.message);
    allLogLines.push(...logLines);

    const s = await runStream([{ status: 503 }, { status: 503 }, { status: 503 }]);
    check('stream: 3 attempts', same(calledModels, [MAIN, MAIN, FALLBACK]), calledModels.join(', '));
    check('stream: client gets only the usual generation_failed', same(s.events, STREAM_FAILED_EVENTS), JSON.stringify(s.events));
    allLogLines.push(...logLines);
  }

  realLog('\n6. Other errors fail at once');
  {
    const r = await runQuestions([{ status: 400 }]);
    check('questions: 400 -> exactly 1 call', same(calledModels, [MAIN]), calledModels.join(', '));
    check('questions: throws the 400', r.err?.status === 400, r.err?.message);
    allLogLines.push(...logLines);

    const s = await runStream([{ status: 400 }]);
    check('stream: 400 -> exactly 1 call', same(calledModels, [MAIN]), calledModels.join(', '));
    check('stream: client gets only the usual generation_failed', same(s.events, STREAM_FAILED_EVENTS), JSON.stringify(s.events));
    allLogLines.push(...logLines);

    const bad = await runQuestions([{ text: 'not json' }]);
    check('questions: invalid JSON -> exactly 1 call, error thrown', same(calledModels, [MAIN]) && /invalid JSON/.test(bad.err?.message), bad.err?.message);
    allLogLines.push(...logLines);
  }

  realLog('\n7. No retry once streaming has started');
  {
    const s = await runStream([{ chunks: ['Good start'], thenStatus: 503 }, streamOk]);
    check('exactly 1 call', same(calledModels, [MAIN]), calledModels.join(', '));
    check('client gets the first chunk, then generation_failed, nothing repeated', same(s.events, [{ chunk: 'Good start' }, ...STREAM_FAILED_EVENTS]), JSON.stringify(s.events));
    check('log says the failure came after streaming started', /attempt 1: 503 after streaming started in/.test(logLines[0]), logLines[0]);
    allLogLines.push(...logLines);

    const e = await runStream([{ chunks: [''], thenStatus: 503 }, streamOk]);
    check('an empty first chunk is not text: still retried', same(calledModels, [MAIN, MAIN]), calledModels.join(', '));
    check('client sees the empty chunk, then the full answer', same(e.events, [{ chunk: '' }, ...STREAM_OK_EVENTS]), JSON.stringify(e.events));
    allLogLines.push(...logLines);
  }

  realLog('\n8. GEMINI_FALLBACK_MODEL');
  {
    process.env.GEMINI_FALLBACK_MODEL = 'custom-fallback';
    await runQuestions([{ status: 429 }, ok]);
    check('set -> questions use it', same(calledModels, [MAIN, 'custom-fallback']), calledModels.join(', '));
    await runStream([{ status: 429 }, streamOk]);
    check('set -> stream uses it', same(calledModels, [MAIN, 'custom-fallback']), calledModels.join(', '));
    allLogLines.push(...logLines);

    process.env.GEMINI_FALLBACK_MODEL = ' custom-fallback ';
    await runQuestions([{ status: 429 }, ok]);
    check('spaces are trimmed', same(calledModels, [MAIN, 'custom-fallback']), calledModels.join(', '));

    for (const [name, raw] of [['empty', ''], ['blank', '   ']]) {
      process.env.GEMINI_FALLBACK_MODEL = raw;
      await runQuestions([{ status: 429 }, ok]);
      check(`${name} -> default fallback`, same(calledModels, [MAIN, FALLBACK]), calledModels.join(', '));
    }

    process.env.GEMINI_FALLBACK_MODEL = MAIN;
    const r = await runQuestions([{ status: 429 }]);
    check('same as the main model -> not called again, error thrown', same(calledModels, [MAIN]) && r.err?.status === 429, calledModels.join(', '));
    delete process.env.GEMINI_FALLBACK_MODEL;
  }

  realLog('\n9. Log lines');
  check(
    `every attempt line matches "[gemini] <model> attempt <n>: <outcome> in <ms>ms" (${allLogLines.length} lines)`,
    allLogLines.length > 0 && allLogLines.every((line) => LOG_FORMAT.test(line)),
    allLogLines.find((line) => !LOG_FORMAT.test(line))
  );

  realLog(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  realError(err);
  process.exit(1);
});

// Checks which Gemini model ai.service.js asks for, from GEMINI_MODEL.
// Run with: npm run test:model
//
// No database, no server and no real Gemini calls: the SDK's GoogleGenAI class
// is replaced with a fake before ai.service.js loads, and the fake only
// records the model each call asked for.

const genai = require('@google/genai');

const requestedModels = [];
genai.GoogleGenAI = class FakeGoogleGenAI {
  constructor() {
    this.models = {
      generateContent: async ({ model }) => {
        requestedModels.push(model);
        return { text: '[{"questionText": "Q?", "category": "technical"}]' };
      },
      generateContentStream: async ({ model }) => {
        requestedModels.push(model);
        return (async function* () {
          yield { text: 'Good answer. SCORE_CLARITY:7 SCORE_STRUCTURE:7 SCORE_CONTENT:7' };
        })();
      },
    };
  }
};

const { generateQuestions, streamFeedback } = require('../src/services/ai.service');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

// Just enough of an Express response for streamFeedback.
function fakeRes() {
  return { setHeader() {}, write() {}, end() {} };
}

// Runs one function with GEMINI_MODEL set to raw (undefined = unset) and
// returns the model it asked the SDK for.
async function modelUsed(fn, raw) {
  if (raw === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = raw;

  requestedModels.length = 0;
  if (fn === 'generateQuestions') await generateQuestions('Backend Engineer', 'mid');
  else await streamFeedback('Q?', 'My answer.', fakeRes());

  return requestedModels.length === 1 ? requestedModels[0] : `${requestedModels.length} calls`;
}

const DEFAULT = 'gemini-3.6-flash';
const cases = [
  ['unset -> default', undefined, DEFAULT],
  ['empty -> default', '', DEFAULT],
  ['blank (spaces) -> default', '   ', DEFAULT],
  ['blank (tab/newline) -> default', '\t\n', DEFAULT],
  ['"gemini-3.8-flash" -> gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash'],
  ['" gemini-3.8-flash " (spaces) -> gemini-3.8-flash', ' gemini-3.8-flash ', 'gemini-3.8-flash'],
];

async function main() {
  const saved = process.env.GEMINI_MODEL;
  try {
    for (const fn of ['generateQuestions', 'streamFeedback']) {
      console.log(`\n${fn}: GEMINI_MODEL`);
      for (const [name, raw, expected] of cases) {
        const actual = await modelUsed(fn, raw);
        check(name, actual === expected, `got ${actual}`);
      }
    }
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = saved;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

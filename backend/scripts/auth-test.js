// Proves the API's sign-in and ownership checks work.
// Run with: npm run test:auth
//
// SAFETY: this only ever talks to TEST_DATABASE_URL (a separate Neon branch).
// It refuses to run if that is missing or the same as DATABASE_URL.
// It never calls Gemini: user B's rows are inserted directly with Prisma.

require('dotenv').config();

// Neon gives each branch its own endpoint host. The pooled and direct strings
// for the SAME branch differ only by "-pooler" in the first part of the host,
// e.g. ep-abc-123-pooler.us-east-2.aws.neon.tech vs ep-abc-123.us-east-2.aws.neon.tech,
// so we strip it before comparing.
function describeDatabase(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname.toLowerCase().replace(/-pooler(?=\.|$)/, ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

// Returns a reason to refuse, or null if the test database is clearly separate.
function refuseReason(testConnectionString, mainConnectionString) {
  if (!testConnectionString) return 'TEST_DATABASE_URL is not set.';
  if (!mainConnectionString) return null; // nothing to collide with
  if (testConnectionString === mainConnectionString) return 'TEST_DATABASE_URL equals DATABASE_URL.';

  let test;
  let main;
  try {
    test = describeDatabase(testConnectionString);
    main = describeDatabase(mainConnectionString);
  } catch {
    return 'Could not parse TEST_DATABASE_URL or DATABASE_URL.';
  }

  // Same host (ignoring "-pooler") means the same Neon branch, whatever the
  // database name, so that alone is enough to refuse.
  if (test.host === main.host) {
    return test.database === main.database
      ? 'TEST_DATABASE_URL points at the same host and database as DATABASE_URL.'
      : 'TEST_DATABASE_URL is on the same host as DATABASE_URL (different database name, still refused).';
  }
  return null;
}

// Self-check of the guard itself (no database involved): these must all be refused.
const guardCases = [
  [
    'pooled vs direct string for the same host',
    'postgresql://u:p@ep-abc-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
    'postgresql://u:p@ep-abc-123.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ],
  [
    'same host, different database name',
    'postgresql://u:p@ep-abc-123.us-east-2.aws.neon.tech/other_db',
    'postgresql://u:p@ep-abc-123-pooler.us-east-2.aws.neon.tech/neondb',
  ],
  [
    'same host, different user/params',
    'postgresql://x:y@EP-ABC-123.us-east-2.aws.neon.tech/neondb',
    'postgresql://u:p@ep-abc-123.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true',
  ],
];
console.log('\nGuard self-check (must refuse)');
let guardOk = true;
for (const [name, test, main] of guardCases) {
  const refused = refuseReason(test, main) !== null;
  guardOk = guardOk && refused;
  console.log(`  ${refused ? 'PASS' : 'FAIL'}  ${name}`);
}
const differentBranch = refuseReason(
  'postgresql://u:p@ep-xyz-789-pooler.us-east-2.aws.neon.tech/neondb',
  'postgresql://u:p@ep-abc-123-pooler.us-east-2.aws.neon.tech/neondb'
);
console.log(`  ${differentBranch === null ? 'PASS' : 'FAIL'}  different branch host is allowed`);
guardOk = guardOk && differentBranch === null;
if (!guardOk) {
  console.error('The database guard itself is broken. Refusing to run.');
  process.exit(1);
}

const testUrl = (process.env.TEST_DATABASE_URL || '').trim();
const mainUrl = (process.env.DATABASE_URL || '').trim();

const reason = refuseReason(testUrl, mainUrl);
if (reason) {
  console.error(`${reason} Refusing to run against the main database.`);
  process.exit(1);
}

// Point Prisma (src/config/db.js) at the test branch BEFORE it is loaded.
process.env.DATABASE_URL = testUrl;

const crypto = require('crypto');
const { SignJWT } = require('jose');
const prisma = require('../src/config/db');
const aiService = require('../src/services/ai.service');
const { loadConfig } = require('../src/config/env');
const { createApp } = require('../src/app');
const { TOKEN_ISSUER, TOKEN_AUDIENCE } = require('../src/middleware/auth');
const errorHandler = require('../src/middleware/errorHandler');

// If any test path ever reached Gemini, fail loudly instead of spending quota.
for (const name of Object.keys(aiService)) {
  if (typeof aiService[name] === 'function' && name !== 'extractScores') {
    aiService[name] = () => {
      throw new Error(`Gemini (${name}) must not be called in tests.`);
    };
  }
}

const config = { ...loadConfig(), trustProxy: false };
const secretKey = new TextEncoder().encode(config.apiAuthSecret);

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

async function signToken(sub, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(overrides.issuer || TOKEN_ISSUER)
    .setAudience(overrides.audience || TOKEN_AUDIENCE)
    .setIssuedAt(overrides.iat ?? now)
    .setExpirationTime(overrides.exp ?? now + 300)
    .sign(overrides.key || secretKey);
}

// Calls errorHandler directly with fake req/res objects (no test-only route).
function checkErrorHandler() {
  const GENERIC = 'Something went wrong on the server.';
  const DB_TEXT = "Can't reach database"; // frontend/lib/api.ts retries on this exact text

  function run(err, { headersSent = false } = {}) {
    const res = {
      headersSent,
      statusCode: null,
      body: undefined,
      sent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        this.sent = true;
        return this;
      },
    };
    let nextArg;
    let nextCalled = false;
    const next = (arg) => {
      nextCalled = true;
      nextArg = arg;
    };

    // The handler logs the real error; keep the fake secrets out of the test output.
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      errorHandler(err, {}, res, next);
    } finally {
      console.error = originalConsoleError;
    }
    return { res, nextCalled, nextArg, text: JSON.stringify(res.body ?? '') };
  }

  console.log('\nError handler (called directly)');

  const secret = 'SECRET-db-password-hunter2 at ep-secret-host.neon.tech';
  const a = run(new Error(secret));
  check('a) plain Error -> 500 with the generic message', a.res.statusCode === 500 && a.res.body?.message === GENERIC && a.res.body?.error === true, `got ${a.res.statusCode}`);
  check('a) ...secret text not in the response', !a.text.includes('SECRET') && !a.text.includes('ep-secret-host'));

  const initError = new Error("Can't reach database server at `ep-secret-host.neon.tech:5432`");
  initError.name = 'PrismaClientInitializationError';
  const b = run(initError);
  check('b) PrismaClientInitializationError -> 503', b.res.statusCode === 503 && b.res.body?.error === true, `got ${b.res.statusCode}`);
  check(`b) ...message contains "${DB_TEXT}"`, typeof b.res.body?.message === 'string' && b.res.body.message.includes(DB_TEXT));
  check('b) ...database host not in the response', !b.text.includes('ep-secret-host'));

  const poolTimeout = new Error('Timed out fetching a new connection from the connection pool. SECRET');
  poolTimeout.code = 'P2024';
  const c = run(poolTimeout);
  check('c) code P2024 -> same 503', c.res.statusCode === 503 && c.res.body?.message === b.res.body?.message && !c.text.includes('SECRET'), `got ${c.res.statusCode}`);

  const badRequest = new Error('Expected double-quoted property name in JSON at position 13');
  badRequest.statusCode = 400;
  const d = run(badRequest);
  check('d) statusCode 400 keeps its status and message', d.res.statusCode === 400 && d.res.body?.message === badRequest.message, `got ${d.res.statusCode}`);

  const lateError = new Error('saving feedback failed after the stream ended');
  const e = run(lateError, { headersSent: true });
  check('e) headersSent -> nothing sent, next(err) called', !e.res.sent && e.res.statusCode === null && e.nextCalled && e.nextArg === lateError);

  const googleError = new Error('Google says: API key not valid. SECRET-google-detail');
  googleError.status = 401; // like a Gemini library error: Google's status, no statusCode
  const f = run(googleError);
  check('f) "status" 401 without statusCode -> generic 500, not 401', f.res.statusCode === 500 && f.res.body?.message === GENERIC, `got ${f.res.statusCode}`);
  check('f) ...Google message not in the response', !f.text.includes('Google says') && !f.text.includes('SECRET'));

  // Drift guard: the frontend's retry text must still match what the API sends.
  const frontendApi = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'frontend', 'lib', 'api.ts'), 'utf8');
  check(`503 text "${DB_TEXT}" is still what frontend/lib/api.ts retries on`, frontendApi.includes(`message.includes("${DB_TEXT}")`));
}

async function main() {
  checkErrorHandler();

  const server = createApp(config).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, token, body) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  const isErrorShape = (json) => json && json.error === true && typeof json.message === 'string';

  // --- Seed two users directly in the test database ---
  const tag = crypto.randomBytes(4).toString('hex');
  const userA = await prisma.user.create({ data: { email: `auth-test-a-${tag}@example.test` } });
  const userB = await prisma.user.create({ data: { email: `auth-test-b-${tag}@example.test` } });

  try {
    const sessionA = await prisma.interviewSession.create({
      data: { userId: userA.id, role: 'Test role A', experienceLevel: 'junior' },
    });
    const sessionB = await prisma.interviewSession.create({
      data: { userId: userB.id, role: 'Test role B', experienceLevel: 'senior' },
    });
    const questionB = await prisma.question.create({
      data: { sessionId: sessionB.id, questionText: 'B question', category: 'test', questionOrder: 1 },
    });

    const tokenA = await signToken(userA.id);
    const tokenB = await signToken(userB.id);

    console.log('\nNo token / bad tokens -> 401');
    for (const [method, path] of [
      ['GET', '/api/sessions'],
      ['GET', `/api/sessions/${sessionA.id}`],
      ['POST', '/api/sessions'],
      ['PATCH', `/api/sessions/${sessionA.id}/complete`],
      ['DELETE', `/api/sessions/${sessionA.id}`],
      ['POST', '/api/answers'],
    ]) {
      const r = await call(method, path, null, method === 'GET' || method === 'DELETE' ? null : {});
      check(`no token: ${method} ${path.replace(sessionA.id, ':id')}`, r.status === 401 && isErrorShape(r.json), `got ${r.status}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const badTokens = {
      'wrong secret': await signToken(userA.id, { key: crypto.randomBytes(48) }),
      'expired token': await signToken(userA.id, { iat: now - 600, exp: now - 60 }),
      'wrong audience': await signToken(userA.id, { audience: 'someone-else' }),
      'wrong issuer': await signToken(userA.id, { issuer: 'someone-else' }),
      'alg none (unsigned)': [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: userA.id, iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE, exp: now + 300 })).toString('base64url'),
        '',
      ].join('.'),
      'malformed token': 'not-a-jwt',
    };
    for (const [name, token] of Object.entries(badTokens)) {
      const r = await call('GET', '/api/sessions', token);
      check(name, r.status === 401 && isErrorShape(r.json), `got ${r.status}`);
    }

    console.log("\nUser A cannot touch user B's session -> 404");
    const missing = await call('GET', `/api/sessions/${crypto.randomUUID()}`, tokenA);

    const read = await call('GET', `/api/sessions/${sessionB.id}`, tokenA);
    check('A reads B session -> 404', read.status === 404 && isErrorShape(read.json), `got ${read.status}`);
    check('...same response as a nonexistent id', missing.status === 404 && JSON.stringify(read.json) === JSON.stringify(missing.json));

    const complete = await call('PATCH', `/api/sessions/${sessionB.id}/complete`, tokenA, { overallScore: 99 });
    const bAfterComplete = await prisma.interviewSession.findUnique({ where: { id: sessionB.id } });
    check('A completes B session -> 404', complete.status === 404 && isErrorShape(complete.json), `got ${complete.status}`);
    check('...B session unchanged', bAfterComplete.status === 'in_progress' && bAfterComplete.overallScore === null);

    const del = await call('DELETE', `/api/sessions/${sessionB.id}`, tokenA);
    const bAfterDelete = await prisma.interviewSession.findUnique({ where: { id: sessionB.id } });
    check('A deletes B session -> 404', del.status === 404 && isErrorShape(del.json), `got ${del.status}`);
    check('...B session still exists', Boolean(bAfterDelete));

    const answer = await call('POST', '/api/answers', tokenA, { questionId: questionB.id, answerText: 'sneaky' });
    const bAnswer = await prisma.answer.findUnique({ where: { questionId: questionB.id } });
    check('A answers B question -> 404', answer.status === 404 && isErrorShape(answer.json), `got ${answer.status}`);
    check('...no answer saved on B question', bAnswer === null);

    console.log('\nList returns only the caller\'s sessions');
    const listA = await call('GET', `/api/sessions?userId=${userB.id}`, tokenA);
    const idsA = (listA.json?.sessions || []).map((s) => s.id);
    check('A list = only A sessions (userId in query ignored)', listA.status === 200 && idsA.length === 1 && idsA[0] === sessionA.id, JSON.stringify(idsA));

    const listB = await call('GET', '/api/sessions', tokenB);
    const idsB = (listB.json?.sessions || []).map((s) => s.id);
    check('B list = only B sessions', listB.status === 200 && idsB.length === 1 && idsB[0] === sessionB.id, JSON.stringify(idsB));

    const oldRoute = await call('GET', `/api/sessions/user/${userB.id}`, tokenA);
    check('old GET /user/:userId route does not leak B data', oldRoute.status === 404, `got ${oldRoute.status}`);

    console.log('\nUser A can still use their own session');
    const ownRead = await call('GET', `/api/sessions/${sessionA.id}`, tokenA);
    check('A reads own session -> 200', ownRead.status === 200 && ownRead.json?.session?.id === sessionA.id, `got ${ownRead.status}`);

    const ownComplete = await call('PATCH', `/api/sessions/${sessionA.id}/complete`, tokenA, { overallScore: 7.5 });
    check('A completes own session -> 200', ownComplete.status === 200 && ownComplete.json?.session?.status === 'completed', `got ${ownComplete.status}`);

    const ownDelete = await call('DELETE', `/api/sessions/${sessionA.id}`, tokenA);
    const aAfterDelete = await prisma.interviewSession.findUnique({ where: { id: sessionA.id } });
    check('A deletes own session -> 200', ownDelete.status === 200 && aAfterDelete === null, `got ${ownDelete.status}`);
  } finally {
    // Removing the users cascades to their sessions, questions and answers.
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    server.close();
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Test run crashed:', err.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

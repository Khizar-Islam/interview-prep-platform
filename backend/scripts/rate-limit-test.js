// Checks the per-user and per-IP rate limits on the real app wiring.
// Run with: npm run test:ratelimit
//
// No database and no Gemini: every controller is replaced with a stub handler
// before the app is built, and every Gemini function throws if called.
// Each test builds a fresh app, so counters never leak between tests.

const { SignJWT } = require('jose');
const aiService = require('../src/services/ai.service');
const sessionsController = require('../src/controllers/sessions.controller');
const answersController = require('../src/controllers/answers.controller');
const { TOKEN_ISSUER, TOKEN_AUDIENCE } = require('../src/middleware/auth');
const { loadConfig } = require('../src/config/env');
const { createApp } = require('../src/app');

// If any test path ever reached Gemini, fail loudly instead of spending quota.
let geminiCalls = 0;
for (const name of Object.keys(aiService)) {
  if (typeof aiService[name] === 'function' && name !== 'extractScores') {
    aiService[name] = () => {
      geminiCalls += 1;
      throw new Error(`Gemini (${name}) must not be called in tests.`);
    };
  }
}

// Stub handlers: answer 200 with the IP the app saw. The routes pick these up
// when createApp builds them.
let handlerCalls = 0;
function stubHandler(req, res) {
  handlerCalls += 1;
  res.json({ ok: true, ip: req.ip });
}
for (const controller of [sessionsController, answersController]) {
  for (const name of Object.keys(controller)) controller[name] = stubHandler;
}

const SECRET = 'rate-limit-test-secret-not-used-anywhere-else';
const secretKey = new TextEncoder().encode(SECRET);
const HOPS = 3; // same as production on Render

const SESSION_NETWORK = 'A lot of interviews have been started from your network recently.';
const ANSWER_NETWORK = 'A lot of answers have been submitted from your network recently.';
const API_NETWORK = 'A lot of requests have come from your network recently.';
const SESSION_USER = 'Too many sessions created recently.';
const WAIT = /Please try again in (a few minutes|about (a minute|an hour|\d+ (minutes|hours)))\.$/;

let passed = 0;
let failed = 0;
let tooManyResponses = 0;
let badTooManyShape = 0;
let okResponses = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

async function signToken(sub) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(secretKey);
}

// With 3 trusted hops, req.ip is the 3rd address from the right in
// X-Forwarded-For. Anything further left was sent by the client and is ignored.
function forwardedFor(visitorIp, spoofed = '6.6.6.6') {
  return `${spoofed}, ${visitorIp}, 172.16.0.1, 10.0.0.1`;
}

async function startApp() {
  const app = createApp({
    apiAuthSecret: SECRET,
    frontendOrigins: ['http://localhost:3000'],
    trustProxy: true,
    trustProxyHops: HOPS,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { user, ip, spoofed } = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor(ip, spoofed) };
    if (user) headers.Authorization = `Bearer ${await signToken(user)}`;
    const res = await fetch(base + path, { method, headers, body: method === 'GET' ? undefined : '{}' });
    const json = await res.json().catch(() => null);
    // /health is not a stub handler, so its 200s are not counted.
    if (res.status === 200 && path !== '/health') okResponses += 1;
    if (res.status === 429) {
      tooManyResponses += 1;
      const goodShape = json && json.error === true && typeof json.message === 'string' && Object.keys(json).length === 2;
      if (!goodShape) badTooManyShape += 1;
    }
    return { status: res.status, json };
  }

  // Sends `count` requests and returns their statuses.
  async function repeat(count, method, path, opts) {
    const statuses = [];
    for (let i = 0; i < count; i += 1) statuses.push((await call(method, path, opts)).status);
    return statuses;
  }

  return { call, repeat, close: () => server.close() };
}

const all200 = (statuses) => statuses.every((s) => s === 200);

async function main() {
  console.log('\n1, 2, 7. Many accounts on one network share the per-IP caps');
  {
    const app = await startApp();
    const ip = '198.51.100.1';
    const a = await app.repeat(10, 'POST', '/api/sessions', { user: 'net-u1', ip });
    const b = await app.repeat(10, 'POST', '/api/sessions', { user: 'net-u2', ip });
    check('2 users x 10 sessions from one IP -> all 200', all200(a) && all200(b), JSON.stringify([...a, ...b]));

    const third = await app.call('POST', '/api/sessions', { user: 'net-u3', ip });
    check('21st session from that IP (fresh user) -> 429', third.status === 429, `got ${third.status}`);
    check('...says it is about the network', third.json?.message?.startsWith(SESSION_NETWORK), third.json?.message);
    check('...says how long to wait', WAIT.test(third.json?.message || ''), third.json?.message);

    const other = await app.call('POST', '/api/sessions', { user: 'net-u3', ip: '198.51.100.2' });
    check('2. same user from a different IP -> 200', other.status === 200, `got ${other.status}`);

    const list = await app.call('GET', '/api/sessions', { user: 'net-u1', ip });
    const one = await app.call('GET', '/api/sessions/some-id', { user: 'net-u1', ip });
    check('7. GET routes from the capped IP still -> 200', list.status === 200 && one.status === 200, `got ${list.status}, ${one.status}`);

    const answer = await app.call('POST', '/api/answers', { user: 'net-u1', ip });
    check('7. answers from the capped IP still -> 200 (separate cap)', answer.status === 200, `got ${answer.status}`);
    app.close();
  }

  console.log('\n1. Answers: per-IP cap of 100 per hour');
  {
    const app = await startApp();
    const ip = '198.51.100.10';
    const statuses = [];
    for (const user of ['ans-u1', 'ans-u2', 'ans-u3']) {
      statuses.push(...(await app.repeat(30, 'POST', '/api/answers', { user, ip })));
    }
    statuses.push(...(await app.repeat(10, 'POST', '/api/answers', { user: 'ans-u4', ip })));
    check('4 users, 100 answers from one IP -> all 200', statuses.length === 100 && all200(statuses));

    const next = await app.call('POST', '/api/answers', { user: 'ans-u5', ip });
    check('101st answer from that IP -> 429', next.status === 429, `got ${next.status}`);
    check('...says it is about the network', next.json?.message?.startsWith(ANSWER_NETWORK), next.json?.message);
    check('...says how long to wait', WAIT.test(next.json?.message || ''), next.json?.message);
    app.close();
  }

  console.log('\n3, 4. The per-user cap fires first and does not use up the network cap');
  {
    const app = await startApp();
    const ip = '198.51.100.20';
    const first = await app.repeat(10, 'POST', '/api/sessions', { user: 'solo-u1', ip });
    const eleventh = await app.call('POST', '/api/sessions', { user: 'solo-u1', ip });
    check('3. one user: 10 sessions -> 200', all200(first));
    check('3. 11th from the same user -> 429 with the per-user message',
      eleventh.status === 429 && eleventh.json?.message?.startsWith(SESSION_USER), `${eleventh.status} ${eleventh.json?.message}`);

    const hammering = await app.repeat(15, 'POST', '/api/sessions', { user: 'solo-u1', ip });
    check('4. 15 more from that user -> all 429', hammering.every((s) => s === 429));

    const friend = await app.repeat(10, 'POST', '/api/sessions', { user: 'solo-u2', ip });
    check('4. a friend on the same network still gets 10 -> all 200', all200(friend), JSON.stringify(friend));

    const third = await app.call('POST', '/api/sessions', { user: 'solo-u3', ip });
    check('4. ...and the network cap is hit at exactly 20 allowed requests',
      third.status === 429 && third.json?.message?.startsWith(SESSION_NETWORK), `${third.status} ${third.json?.message}`);
    app.close();
  }

  console.log('\n5. Trust proxy (3 hops): the visitor IP is used, spoofed entries are ignored');
  {
    const app = await startApp();
    const ip = '198.51.100.30';
    const echo = await app.call('GET', '/api/sessions', { user: 'tp-u1', ip, spoofed: '6.6.6.6' });
    check('req.ip is the visitor, not the spoofed or proxy entries', echo.json?.ip === ip, `got ${echo.json?.ip}`);

    await app.repeat(10, 'POST', '/api/sessions', { user: 'tp-u1', ip, spoofed: '6.6.6.6' });
    await app.repeat(10, 'POST', '/api/sessions', { user: 'tp-u2', ip, spoofed: '7.7.7.7' });
    const faked = await app.call('POST', '/api/sessions', { user: 'tp-u3', ip, spoofed: '8.8.8.8' });
    check('changing the spoofed entry does not reset the IP cap -> 429', faked.status === 429, `got ${faked.status}`);
    app.close();
  }

  console.log('\n6. IPv6 addresses in the same /56 share one counter');
  {
    const app = await startApp();
    await app.repeat(10, 'POST', '/api/sessions', { user: 'v6-u1', ip: '2001:db8:abcd:1200::1' });
    await app.repeat(10, 'POST', '/api/sessions', { user: 'v6-u2', ip: '2001:db8:abcd:1234::99' });
    const sameBlock = await app.call('POST', '/api/sessions', { user: 'v6-u3', ip: '2001:db8:abcd:12ff::2' });
    const otherBlock = await app.call('POST', '/api/sessions', { user: 'v6-u3', ip: '2001:db8:abcd:1300::1' });
    check('another address in the same /56 -> 429', sameBlock.status === 429, `got ${sameBlock.status}`);
    check('an address in a different /56 -> 200', otherBlock.status === 200, `got ${otherBlock.status}`);
    app.close();
  }

  console.log('\nLoose /api cap runs before the sign-in check');
  {
    const app = await startApp();
    const ip = '198.51.100.40';
    const noToken = await app.repeat(300, 'GET', '/api/sessions', { ip });
    check('300 requests without a token -> all 401', noToken.every((s) => s === 401));
    const next = await app.call('GET', '/api/sessions', { user: 'loose-u1', ip });
    check('301st (even with a valid token) -> 429', next.status === 429 && next.json?.message?.startsWith(API_NETWORK), `${next.status} ${next.json?.message}`);
    const health = await app.call('GET', '/health', { ip });
    check('/health is not under the /api cap -> 200', health.status === 200, `got ${health.status}`);
    app.close();
  }

  console.log('\n8. 429 shape, and no work done on a 429');
  check(`every 429 is exactly { error: true, message } (${tooManyResponses} seen)`, tooManyResponses > 0 && badTooManyShape === 0, `${badTooManyShape} bad`);
  check('the stub handler ran once per 200 and never on a 429', handlerCalls === okResponses, `handler ${handlerCalls}, 200s ${okResponses}`);
  check('Gemini was never called', geminiCalls === 0, `${geminiCalls} calls`);

  console.log('\n9. loadConfig turns trust proxy on only in production or on Render');
  const saved = { ...process.env };
  try {
    process.env.API_AUTH_SECRET = SECRET;
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
    delete process.env.RENDER;
    process.env.NODE_ENV = 'development';
    check('local -> trust proxy off', loadConfig().trustProxy === false);

    process.env.RENDER = 'true';
    process.env.TRUST_PROXY_HOPS = '3';
    const onRender = loadConfig();
    check('RENDER set -> on, with 3 hops', onRender.trustProxy === true && onRender.trustProxyHops === 3);

    delete process.env.RENDER;
    process.env.NODE_ENV = 'production';
    check('NODE_ENV=production -> on', loadConfig().trustProxy === true);
  } finally {
    process.env = saved;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test run crashed:', err.message);
  process.exit(1);
});

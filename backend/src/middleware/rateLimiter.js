// This file defines rate limits for the API.
// Since this app is publicly deployed and Gemini has usage quotas/costs,
// we cap how many requests can be made in a given time window.
//
// The per-user limiters run AFTER the sign-in check (see app.js), so they count
// per signed-in user (req.userId). If there's somehow no user, they fall back
// to the visitor's IP address.
//
// The per-IP limiters stop one person from getting around the per-user caps by
// making many accounts. They rely on req.ip, so TRUST_PROXY_HOPS must match
// the host (see README). IPv6 addresses are grouped by /56 (ipKeyGenerator's
// default), so one home connection counts as one address.
//
// createRateLimiters() makes fresh counters each time, so every app built by
// createApp (including in tests) gets its own.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function userOrIpKey(req) {
  return req.userId ? `user:${req.userId}` : `ip:${ipKeyGenerator(req.ip)}`;
}

function ipKey(req) {
  return `ip:${ipKeyGenerator(req.ip)}`;
}

const createSessionOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    error: true,
    message: 'Too many sessions created recently. Please wait a few minutes and try again.',
  },
};

const submitAnswerOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    error: true,
    message: 'Too many answers submitted recently. Please wait a few minutes and try again.',
  },
};

// "about 25 minutes", "about an hour", "about 19 hours": how long until this
// limiter's window resets for the visitor.
function timeUntilReset(req) {
  const resetTime = req.rateLimit && req.rateLimit.resetTime;
  if (!resetTime) return 'a few minutes';

  const minutes = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / MINUTE));
  if (minutes === 1) return 'about a minute';
  if (minutes < 60) return `about ${minutes} minutes`;

  const hours = Math.max(1, Math.round(minutes / 60));
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

function ipLimiter(windowMs, max, whatHappened) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: (req) => ({
      error: true,
      message: `${whatHappened} from your network recently. Please try again in ${timeUntilReset(req)}.`,
    }),
  });
}

function createRateLimiters() {
  return {
    // Per signed-in user (unchanged limits and messages).
    createSessionLimiter: rateLimit(createSessionOptions),
    submitAnswerLimiter: rateLimit(submitAnswerOptions),

    // Per IP on the two Gemini routes: an hourly cap, plus a daily cap so
    // many accounts on one network can't spend the quota over a whole day.
    // Counters live in memory, so a restart or deploy resets them.
    createSessionIpLimiters: [
      ipLimiter(HOUR, 20, 'A lot of interviews have been started'),
      ipLimiter(DAY, 50, 'A lot of interviews have been started'),
    ],
    submitAnswerIpLimiters: [
      ipLimiter(HOUR, 100, 'A lot of answers have been submitted'),
      ipLimiter(DAY, 300, 'A lot of answers have been submitted'),
    ],

    // Loose cap on everything under /api. It runs BEFORE the sign-in check.
    apiIpLimiter: ipLimiter(15 * MINUTE, 300, 'A lot of requests have come'),
  };
}

module.exports = { createRateLimiters };

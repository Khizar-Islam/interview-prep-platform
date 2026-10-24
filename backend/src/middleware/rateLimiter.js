// This file defines rate limits for routes that call the Gemini API.
// Since this app is publicly deployed and Gemini has usage quotas/costs,
// we cap how many requests a single user can make in a given time window.
//
// These limiters run AFTER the sign-in check (see app.js), so they count
// per signed-in user (req.userId). If there's somehow no user, they fall back
// to the visitor's IP address.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function userOrIpKey(req) {
  return req.userId ? `user:${req.userId}` : `ip:${ipKeyGenerator(req.ip)}`;
}

const createSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    error: true,
    message: 'Too many sessions created recently. Please wait a few minutes and try again.',
  },
});

const submitAnswerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    error: true,
    message: 'Too many answers submitted recently. Please wait a few minutes and try again.',
  },
});

module.exports = {
  createSessionLimiter,
  submitAnswerLimiter,
};

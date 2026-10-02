// This file defines rate limits for routes that call the Gemini API.
// Since this app is publicly deployed and Gemini has usage quotas/costs,
// we cap how many requests a single IP can make in a given time window.

const rateLimit = require('express-rate-limit');

const createSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: {
    error: true,
    message: 'Too many answers submitted recently. Please wait a few minutes and try again.',
  },
});

module.exports = {
  createSessionLimiter,
  submitAnswerLimiter,
};
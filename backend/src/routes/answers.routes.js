// Defines the URL for submitting an answer.

const express = require('express');
const answersController = require('../controllers/answers.controller');

// Built inside createApp with that app's rate limiters (see middleware/rateLimiter.js).
// Per-user cap first, then per-IP caps.
function createAnswersRouter(limiters) {
  const router = express.Router();
  router.post(
    '/',
    limiters.submitAnswerLimiter,
    limiters.submitAnswerIpLimiters,
    answersController.submitAnswer
  );
  return router;
}

module.exports = createAnswersRouter;
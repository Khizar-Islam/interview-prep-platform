// This file defines the actual URL paths for everything session-related,
// and connects each URL + HTTP method to the matching function in the controller.
// Every route here requires sign-in (see app.js); the user comes from req.userId.

const express = require('express');
const sessionsController = require('../controllers/sessions.controller');

// Built inside createApp with that app's rate limiters (see middleware/rateLimiter.js).
function createSessionsRouter(limiters) {
  const router = express.Router();

  router.get('/', sessionsController.getUserSessions);
  router.get('/:id', sessionsController.getSessionById);
  // Per-user cap first, then per-IP caps, so one user hammering past their
  // own cap doesn't use up the network's shared budget.
  router.post(
    '/',
    limiters.createSessionLimiter,
    limiters.createSessionIpLimiters,
    sessionsController.createSession
  );
  router.patch('/:id/complete', sessionsController.completeSession);
  router.delete('/:id', sessionsController.deleteSession);

  return router;
}

module.exports = createSessionsRouter;

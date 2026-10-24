// This file defines the actual URL paths for everything session-related,
// and connects each URL + HTTP method to the matching function in the controller.
// Every route here requires sign-in (see app.js); the user comes from req.userId.

const express = require('express');
const router = express.Router();
const sessionsController = require('../controllers/sessions.controller');
const { createSessionLimiter } = require('../middleware/rateLimiter');

router.get('/', sessionsController.getUserSessions);
router.get('/:id', sessionsController.getSessionById);
router.post('/', createSessionLimiter, sessionsController.createSession);
router.patch('/:id/complete', sessionsController.completeSession);
router.delete('/:id', sessionsController.deleteSession);

module.exports = router;

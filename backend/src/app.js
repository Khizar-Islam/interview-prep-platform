// Builds the Express app (routes, middleware) without starting it.
// index.js starts it for real; scripts/auth-test.js starts it for tests.

const express = require('express');
const cors = require('cors');

const createSessionsRouter = require('./routes/sessions.routes');
const createAnswersRouter = require('./routes/answers.routes');
const errorHandler = require('./middleware/errorHandler');
const { createRequireAuth } = require('./middleware/auth');
const { createRateLimiters } = require('./middleware/rateLimiter');

function createApp(config) {
  const app = express();

  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxyHops);
  }

  // Only the frontend URLs listed in FRONTEND_ORIGIN may call this API from a browser.
  // Requests from other origins get no CORS headers, so the browser blocks them.
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = not a cross-site browser request (curl, server-to-server).
        // Those are still stopped by the sign-in check below.
        if (!origin) return callback(null, true);
        callback(null, config.frontendOrigins.includes(origin));
      },
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Allows the server to understand JSON sent from the frontend (req.body)
  app.use(express.json());

  // Simple health check — visit http://localhost:5000/health in your browser
  // to confirm the server is actually running. Stays public (no sign-in needed).
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running.' });
  });

  // Fresh counters for this app (tests build many apps).
  const limiters = createRateLimiters();

  // Loose per-IP cap on everything under /api. It runs BEFORE the sign-in
  // check, so floods without a valid token are turned away cheaply.
  // (CORS preflights are answered above and never reach it.)
  app.use('/api', limiters.apiIpLimiter);

  // Everything under /api/sessions and /api/answers requires a valid sign-in token.
  // It runs before the routes, so the per-user limiters inside them can key by req.userId.
  const requireAuth = createRequireAuth(config.apiAuthSecret);

  // All session-related routes live under /api/sessions
  // e.g. POST http://localhost:5000/api/sessions creates a new session
  app.use('/api/sessions', requireAuth, createSessionsRouter(limiters));

  // All answer-submission routes live under /api/answers
  // e.g. POST http://localhost:5000/api/answers submits an answer and streams AI feedback
  app.use('/api/answers', requireAuth, createAnswersRouter(limiters));

  // This MUST be the last app.use() call — it catches any error from any route above
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

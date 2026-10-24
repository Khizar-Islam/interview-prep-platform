// This catches any error thrown in any route/controller so the server
// never crashes silently and the frontend always gets a clean JSON error
// response instead of an ugly HTML error page.
//
// The real error and stack are always logged here (visible in Render's logs),
// but internal details never reach the browser. Only deliberate 4xx errors
// keep their own message.

const GENERIC_MESSAGE = 'Something went wrong on the server.';

// IMPORTANT: this message must keep the exact text "Can't reach database"
// (straight apostrophe). frontend/lib/api.ts (createSession) retries once on a
// database cold start by searching the error message for that text, so
// changing the wording here silently breaks that retry.
const DATABASE_UNREACHABLE_MESSAGE = "Can't reach database right now. Please try again.";

// Prisma errors that mean the database couldn't be reached in time
// (e.g. Neon's free tier waking up), not that the request was wrong.
const DATABASE_UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P2024']);

function isDatabaseUnreachable(err) {
  return (
    err.name === 'PrismaClientInitializationError' ||
    DATABASE_UNREACHABLE_CODES.has(err.code)
  );
}

function errorHandler(err, req, res, next) {
  console.error('ERROR:', err.message);
  console.error(err.stack);

  // The response has already started (e.g. a streamed answer finished and
  // then saving it failed). A second response is impossible, so hand the
  // error to Express, which closes the connection.
  if (res.headersSent) {
    return next(err);
  }

  if (isDatabaseUnreachable(err)) {
    return res.status(503).json({ error: true, message: DATABASE_UNREACHABLE_MESSAGE });
  }

  // Deliberate client errors (including body-parser's 400 invalid JSON and
  // 413 body too large) keep their status and message, as before.
  // Only statusCode counts: Gemini library errors carry Google's own HTTP
  // status in "status", and those must not pass through as ours.
  const status = err.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({
      error: true,
      message: err.message || GENERIC_MESSAGE,
    });
  }

  // Anything else is unexpected: never send its message to the browser.
  res.status(500).json({ error: true, message: GENERIC_MESSAGE });
}

module.exports = errorHandler;

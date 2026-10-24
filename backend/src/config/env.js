// Reads and checks the settings the server cannot run safely without.
// If any of them is missing or too weak, this throws on startup, so the
// server refuses to start instead of running with auth or CORS half-configured.

const MIN_SECRET_LENGTH = 32;

function loadConfig() {
  const apiAuthSecret = process.env.API_AUTH_SECRET;
  if (!apiAuthSecret || apiAuthSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `API_AUTH_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. Refusing to start.`
    );
  }

  // Comma-separated list of frontend URLs allowed to call this API,
  // e.g. "http://localhost:3000,https://your-app.vercel.app".
  // Trailing slashes are stripped because browsers never send them in Origin.
  const frontendOrigins = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (frontendOrigins.length === 0) {
    throw new Error('FRONTEND_ORIGIN is missing. Refusing to start.');
  }

  return {
    apiAuthSecret,
    frontendOrigins,
    // Render (and most hosts) put a proxy in front of the app, so the real
    // visitor IP is in X-Forwarded-For. Without this, everyone shares one IP.
    trustProxy: process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER),
  };
}

module.exports = { loadConfig };

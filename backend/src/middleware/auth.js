// Checks that every request to a protected route carries a valid sign-in token.
//
// The Next.js frontend signs a short-lived (5 minute) token for the signed-in
// user and sends it as "Authorization: Bearer <token>". We verify it here and
// put the user's id on req.userId. Controllers must use req.userId ONLY and
// never trust a userId sent in the URL, query string, or body.

const { jwtVerify } = require('jose');

const TOKEN_ISSUER = 'interview-prep-web';
const TOKEN_AUDIENCE = 'interview-prep-api';

function unauthorized(res) {
  return res.status(401).json({
    error: true,
    message: 'Your sign-in has expired. Please sign in again.',
  });
}

function createRequireAuth(secret) {
  const key = new TextEncoder().encode(secret);

  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return unauthorized(res);
    }

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        requiredClaims: ['exp', 'sub'],
      });

      if (typeof payload.sub !== 'string' || !payload.sub) {
        return unauthorized(res);
      }

      req.userId = payload.sub;
      next();
    } catch {
      // Bad signature, wrong algorithm/issuer/audience, expired, or malformed.
      return unauthorized(res);
    }
  };
}

module.exports = { createRequireAuth, TOKEN_ISSUER, TOKEN_AUDIENCE };

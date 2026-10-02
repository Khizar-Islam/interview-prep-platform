// This catches any error thrown in any route/controller so the server
// never crashes silently and the frontend always gets a clean JSON error
// response instead of an ugly HTML error page.

function errorHandler(err, req, res, next) {
  console.error('ERROR:', err.message);
  console.error(err.stack);

  res.status(err.statusCode || 500).json({
    error: true,
    message: err.message || 'Something went wrong on the server.',
  });
}

module.exports = errorHandler;

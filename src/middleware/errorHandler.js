/**
 * Global error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  console.error('Error caught by error handler:', error);

  // Default error response
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details = null;

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = error.message;
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.status) {
    statusCode = error.status;
    message = error.message;
  } else if (error.message) {
    message = error.message;
  }

  // Send error response
  const errorResponse = {
    error: true,
    message: message,
    timestamp: new Date().toISOString(),
    path: req.path
  };

  if (details) {
    errorResponse.details = details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler middleware
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: true,
    message: 'Route not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
}; 
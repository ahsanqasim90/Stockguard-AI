export function notFoundHandler(request, response) {
  response.status(404).json({
    error: "Not Found",
    message: `Route ${request.method} ${request.originalUrl} does not exist.`,
  });
}

export function errorHandler(error, _request, response, _next) {
  const statusCode = error.statusCode ?? error.status ?? (error.code === 11000 ? 409 : 500);

  if (process.env.NODE_ENV !== "test") console.error(error);

  response.status(statusCode).json({
    error: statusCode >= 500 ? "Internal Server Error" : "Request Error",
    message: error.code === 11000
      ? "A record with these details already exists."
      :
      statusCode >= 500 && process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : error.message,
  });
}

// Errors the API returns on purpose. Anything else becomes a plain 500 with no
// stack trace or internal detail in the response.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const forbidden = (message = 'You do not have permission to do this') => new HttpError(403, message);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(log = console.error) {
  // Express recognises error handlers by their four arguments.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'The request body is not valid JSON' });
      return;
    }
    log(JSON.stringify({ msg: 'unhandled error', method: req.method, path: req.path, error: err.message }));
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  };
}

// One JSON line per request on stdout: method, path, status, duration.
// Request bodies are never logged.
export function requestLogger(log = console.log) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      log(
        JSON.stringify({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Math.round(durationMs * 10) / 10,
        }),
      );
    });
    next();
  };
}

// One JSON line per request on stdout: method, path, status, duration.
// Request bodies are never logged.
export function requestLogger(log = console.log) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    // Captured now: routers rewrite req.url, so by "finish" req.path is relative
    // (/6 instead of /courses/6). The query string is left out on purpose.
    const path = req.originalUrl.split('?')[0];
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      log(
        JSON.stringify({
          method: req.method,
          path,
          status: res.statusCode,
          duration_ms: Math.round(durationMs * 10) / 10,
        }),
      );
    });
    next();
  };
}

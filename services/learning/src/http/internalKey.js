// Service-to-service calls (projects -> learning) carry a shared key in the
// X-Internal-Key header, the "simple mechanism" the brief allows. It comes from
// the INTERNAL_API_KEY environment variable (a Container Apps secret on Azure).
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function requireInternalKey(expected) {
  return (req, res, next) => {
    if (!expected) return next(new HttpError(503, 'The internal API is not configured'));
    const given = req.get('X-Internal-Key') ?? '';
    if (!same(given, expected)) return next(new HttpError(401, 'Missing or wrong internal key'));
    return next();
  };
}

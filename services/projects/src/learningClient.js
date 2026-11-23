// HTTP client for the learning service (Adapter), with the partial-failure rules
// from the brief (story #25): every call has a timeout, and after repeated
// failures a circuit breaker stops calling for a while, so a learning outage
// makes the affected feature fail fast with a clear message instead of hanging.
import { HttpError } from './http/errors.js';

const UNAVAILABLE =
  'The learning service is not reachable right now, so trainee levels cannot be checked. ' +
  'Everything else keeps working; try again in a minute.';

export function createLearningClient({
  baseUrl,
  internalKey,
  timeoutMs = 3000,
  failureThreshold = 3,
  openMs = 30_000,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let failures = 0;
  let openUntil = 0;

  async function call(path, { method = 'GET', body } = {}) {
    if (now() < openUntil) throw new HttpError(503, UNAVAILABLE);

    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { 'X-Internal-Key': internalKey ?? '', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      res = null; // network error or timeout
    }

    if (!res || res.status >= 500) {
      failures += 1;
      if (failures >= failureThreshold) openUntil = now() + openMs;
      throw new HttpError(503, UNAVAILABLE);
    }
    failures = 0;
    const data = await res.json().catch(() => ({}));
    // A 4xx is a real answer (e.g. unknown trainee), not an outage.
    if (!res.ok) throw new HttpError(res.status, data.error ?? `Learning service answered ${res.status}`);
    return data;
  }

  return {
    eligibility: (traineeId) => call(`/internal/trainees/${encodeURIComponent(traineeId)}/eligibility`),
    awardProjectCredit: (payload) => call('/internal/project-credits', { method: 'POST', body: payload }),
    /** For /health/learning and tests. */
    state: () => ({ failures, open: now() < openUntil }),
  };
}

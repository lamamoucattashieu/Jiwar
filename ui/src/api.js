// One place where the UI talks to the two services. Every call has a timeout
// and turns failures into a sentence a person can act on.
const { LEARNING_URL, PROJECTS_URL } = window.JIWAR_CONFIG;

export const SERVICES = { learning: LEARNING_URL, projects: PROJECTS_URL };

const TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const wakingUp = (service) =>
  `The ${service} service is starting up after being idle. Please try again in a minute.`;

let currentUserId = null;
export const setApiUser = (id) => {
  currentUserId = id;
};

export async function api(service, path, { method = 'GET', body } = {}) {
  const headers = {};
  if (currentUserId) headers['X-Demo-User'] = currentUserId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${SERVICES[service]}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new ApiError(wakingUp(service));
    throw new ApiError(
      `The ${service} service cannot be reached. The rest of Jiwar still works; try again shortly.`,
    );
  }

  // On Azure, the first request after an idle period starts the container and
  // wakes the paused database; until then Azure answers 503.
  if (res.status === 503) throw new ApiError(wakingUp(service), { status: 503 });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `Request failed (HTTP ${res.status})`, {
      status: res.status,
      details: data.details,
    });
  }
  return data;
}

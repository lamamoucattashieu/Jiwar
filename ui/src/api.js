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
    const why = err.name === 'TimeoutError' ? 'did not answer in time' : 'cannot be reached';
    throw new ApiError(`The ${service} service ${why}. The rest of Jiwar still works; try again shortly.`);
  }

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

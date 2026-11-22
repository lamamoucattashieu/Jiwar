// Demo users instead of real authentication (ADR-4). The UI sends the chosen
// user's id in the X-Demo-User header; roles are checked here, on the server,
// for every protected route.
import { HttpError } from './errors.js';

export const DEMO_USERS = Object.freeze([
  { id: 'admin-rania', name: 'Rania Haddad', roles: ['admin'] },
  { id: 'instructor-omar', name: 'Omar Khalil', roles: ['instructor'] },
  { id: 'instructor-dana', name: 'Dana Saleh', roles: ['instructor'] },
  { id: 'trainee-yousef', name: 'Yousef Hamdan', roles: ['trainee'] },
  { id: 'trainee-mariam', name: 'Mariam Odeh', roles: ['trainee'] },
  { id: 'trainee-ahmad', name: 'Ahmad Nasser', roles: ['trainee'] },
  { id: 'company-zaytoun', name: 'Hiba Mansour', roles: ['company'], company: 'Zaytoun Bakery' },
  { id: 'company-petra', name: 'Faris Tal', roles: ['company'], company: 'Petra Trails' },
]);

const byId = new Map(DEMO_USERS.map((u) => [u.id, u]));

export const hasRole = (user, ...roles) => Boolean(user) && user.roles.some((r) => roles.includes(r));

// Sets req.user (or null for an anonymous visitor). An unknown id is rejected
// rather than silently treated as anonymous.
export function identify(req, res, next) {
  const id = req.get('X-Demo-User');
  if (!id) {
    req.user = null;
    return next();
  }
  const user = byId.get(id);
  if (!user) return next(new HttpError(401, `Unknown demo user "${id}"`));
  req.user = user;
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Choose a demo user first'));
    if (!hasRole(req.user, ...roles)) {
      return next(new HttpError(403, `This needs one of these roles: ${roles.join(', ')}`));
    }
    return next();
  };
}

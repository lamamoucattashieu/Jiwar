// The project workflow as a state machine (story #16). Pure data and functions:
// which action moves a project from which status to which, and who may do it.
//
//   requested --quote--> quoted --accept--> accepted --assign--> in_progress
//   in_progress --submit--> in_review --approve--> approved
//   in_review --request_revision--> in_progress   (at most max_revisions times)
//   requested | quoted --cancel--> cancelled
import { HttpError } from '../http/errors.js';
import { hasRole } from '../http/auth.js';

// Who someone is to a project decides what they may do with it.
export const RELATION = Object.freeze({ admin: 'admin', owner: 'owner', assignee: 'assignee' });

export const ACTIONS = Object.freeze({
  quote: { from: ['requested'], to: 'quoted', who: [RELATION.admin] },
  accept: { from: ['quoted'], to: 'accepted', who: [RELATION.owner] },
  assign: { from: ['accepted'], to: 'in_progress', who: [RELATION.admin] },
  submit: { from: ['in_progress'], to: 'in_review', who: [RELATION.assignee] },
  request_revision: { from: ['in_review'], to: 'in_progress', who: [RELATION.owner] },
  approve: { from: ['in_review'], to: 'approved', who: [RELATION.owner] },
  cancel: { from: ['requested', 'quoted'], to: 'cancelled', who: [RELATION.owner, RELATION.admin] },
});

/** Every way this user is related to the project (an admin who is also the owner is both). */
export function relationsOf(user, project) {
  const relations = [];
  if (hasRole(user, 'admin')) relations.push(RELATION.admin);
  if (user && project.companyId === user.id) relations.push(RELATION.owner);
  if (user && project.traineeId === user.id) relations.push(RELATION.assignee);
  return relations;
}

const guardFails = (action, project) =>
  action === 'request_revision' && project.revisionsUsed >= project.maxRevisions;

/** The actions this user can take on the project right now (for the UI). */
export function allowedActions(user, project) {
  const relations = relationsOf(user, project);
  return Object.entries(ACTIONS)
    .filter(([, rule]) => rule.from.includes(project.status))
    .filter(([, rule]) => rule.who.some((w) => relations.includes(w)))
    .filter(([name]) => !guardFails(name, project))
    .map(([name]) => name);
}

/** The status an action leads to, or a clear error (403 not yours, 409 wrong state). */
export function nextStatus(action, user, project) {
  const rule = ACTIONS[action];
  const relations = relationsOf(user, project);
  if (!rule.who.some((w) => relations.includes(w))) {
    throw new HttpError(
      403,
      `Only the ${rule.who.join(' or ')} can ${action.replace('_', ' ')} this project`,
    );
  }
  if (!rule.from.includes(project.status)) {
    throw new HttpError(
      409,
      `You cannot ${action.replace('_', ' ')} a project that is ${project.status.replace('_', ' ')}`,
    );
  }
  if (guardFails(action, project)) {
    throw new HttpError(409, `All ${project.maxRevisions} revision rounds have been used`);
  }
  return rule.to;
}

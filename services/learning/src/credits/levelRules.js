// What each level needs (stories #13 and #14). Pure functions: no database, no HTTP.
// Thresholds are the placeholders from the proposal (30, 70, 120 credits).
export const LEVELS = Object.freeze([
  { level: 1, name: 'Junior', credits: 30, requiredCourseLevel: 1, projects: 0 },
  { level: 2, name: 'Builder', credits: 70, requiredCourseLevel: 2, projects: 1 },
  { level: 3, name: 'Lead', credits: 120, requiredCourseLevel: 3, projects: 3 },
]);

export const MAX_LEVEL = LEVELS.at(-1).level;
export const PERMIT_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A permit counts only when an admin verified it and it has not expired. */
export function isPermitValid(permit, today) {
  if (!permit || permit.status !== 'verified') return false;
  return !permit.expiresOn || permit.expiresOn >= today;
}

/** Verified permits that expire within PERMIT_WARNING_DAYS (and have not expired yet). */
export function isPermitExpiringSoon(permit, today) {
  if (!isPermitValid(permit, today) || !permit.expiresOn) return false;
  const days = (Date.parse(permit.expiresOn) - Date.parse(today)) / DAY_MS;
  return days <= PERMIT_WARNING_DAYS;
}

/** Which requirements of `rule` the trainee still misses, as stable keys the UI translates. */
export function missingFor(rule, facts) {
  const missing = [];
  if (facts.credits < rule.credits) missing.push('credits');
  if (!facts.passedRequirementLevels.has(rule.requiredCourseLevel)) missing.push('requiredCourse');
  if (!facts.permitValid) missing.push('permit');
  if (facts.projectsCompleted < rule.projects) missing.push('projects');
  return missing;
}

/**
 * The level the facts support, and what the next level still needs.
 * facts: { credits, passedRequirementLevels: Set<number>, permitValid, projectsCompleted }
 */
export function computeLevel(facts) {
  let level = 0;
  for (const rule of LEVELS) {
    if (missingFor(rule, facts).length > 0) break;
    level = rule.level;
  }
  return level;
}

/**
 * A trainee's standing. Levels never drop on their own (proposal rule), so the
 * stored level wins when the facts would give a lower one, for example after a
 * permit expires; project access is paused separately by an admin.
 */
export function standing(facts, storedLevel = 0) {
  const level = Math.max(computeLevel(facts), storedLevel);
  const next = LEVELS.find((r) => r.level === level + 1);
  return {
    level,
    credits: facts.credits,
    permitValid: facts.permitValid,
    projectsCompleted: facts.projectsCompleted,
    next: next
      ? {
          level: next.level,
          name: next.name,
          creditsNeeded: next.credits,
          projectsNeeded: next.projects,
          missing: missingFor(next, facts),
        }
      : null,
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLevel, isPermitExpiringSoon, isPermitValid, standing } from '../src/credits/levelRules.js';

const TODAY = '2026-11-22';
const facts = (over = {}) => ({
  credits: 0,
  passedRequirementLevels: new Set(),
  permitValid: false,
  projectsCompleted: 0,
  ...over,
});

test('level 1 needs 30 credits, Web basics and a valid permit, all three', () => {
  const ready = facts({ credits: 30, passedRequirementLevels: new Set([1]), permitValid: true });
  assert.equal(computeLevel(ready), 1);
  assert.equal(computeLevel({ ...ready, credits: 29 }), 0);
  assert.equal(computeLevel({ ...ready, passedRequirementLevels: new Set() }), 0);
  assert.equal(computeLevel({ ...ready, permitValid: false }), 0);
});

test('level 2 also needs React and one project; level 3 Practical AI and three', () => {
  const base = { passedRequirementLevels: new Set([1, 2, 3]), permitValid: true };
  assert.equal(computeLevel(facts({ ...base, credits: 70, projectsCompleted: 0 })), 1);
  assert.equal(computeLevel(facts({ ...base, credits: 70, projectsCompleted: 1 })), 2);
  assert.equal(computeLevel(facts({ ...base, credits: 120, projectsCompleted: 2 })), 2);
  assert.equal(computeLevel(facts({ ...base, credits: 120, projectsCompleted: 3 })), 3);
});

test('levels are reached in order: lots of credits do not skip a missing module', () => {
  assert.equal(
    computeLevel(facts({ credits: 500, passedRequirementLevels: new Set([2, 3]), permitValid: true })),
    0,
  );
});

test('standing explains what the next level still needs', () => {
  const s = standing(facts({ credits: 18, passedRequirementLevels: new Set([1]) }));
  assert.equal(s.level, 0);
  assert.deepEqual(s.next, {
    level: 1,
    name: 'Junior',
    creditsNeeded: 30,
    projectsNeeded: 0,
    missing: ['credits', 'permit'],
  });
});

test('a level never drops on its own, for example after a permit expires', () => {
  const s = standing(facts({ credits: 40, passedRequirementLevels: new Set([1]) }), 1);
  assert.equal(s.level, 1);
  assert.equal(s.next.level, 2);
});

test('there is no next level after the top one', () => {
  const top = facts({
    credits: 200,
    passedRequirementLevels: new Set([1, 2, 3]),
    permitValid: true,
    projectsCompleted: 5,
  });
  assert.equal(standing(top).next, null);
});

test('a permit is valid only when verified and not expired', () => {
  assert.equal(isPermitValid(null, TODAY), false);
  assert.equal(isPermitValid({ status: 'pending', expiresOn: '2027-01-01' }, TODAY), false);
  assert.equal(isPermitValid({ status: 'verified', expiresOn: '2026-11-21' }, TODAY), false);
  assert.equal(isPermitValid({ status: 'verified', expiresOn: TODAY }, TODAY), true);
  assert.equal(isPermitValid({ status: 'verified', expiresOn: null }, TODAY), true);
});

test('expiring soon means valid and ending within 30 days', () => {
  const v = (expiresOn) => ({ status: 'verified', expiresOn });
  assert.equal(isPermitExpiringSoon(v('2026-12-10'), TODAY), true);
  assert.equal(isPermitExpiringSoon(v('2026-12-22'), TODAY), true);
  assert.equal(isPermitExpiringSoon(v('2026-12-23'), TODAY), false);
  assert.equal(isPermitExpiringSoon(v('2026-11-01'), TODAY), false, 'already expired is not "soon"');
  assert.equal(isPermitExpiringSoon(v(null), TODAY), false);
});

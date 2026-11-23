// Credits, levels, permits and notifications (stories #12, #13, #14).
// Rules only: the store (a port) is passed in, so the same rules run against
// SQL Server and an in-memory store. Changes that other things react to write
// an event to the outbox in the same transaction (see events.js).
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { DEMO_USERS, hasRole } from '../http/auth.js';
import { parse } from '../http/validate.js';
import { isPermitExpiringSoon, isPermitValid, standing } from './levelRules.js';
import {
  correctionInput,
  idParam,
  pausedInput,
  permitInput,
  projectCreditInput,
  rejectInput,
  resultInput,
  traineeParam,
} from './creditSchema.js';

export const EVENTS = Object.freeze({
  creditsChanged: 'credits.changed',
  resultRejected: 'result.rejected',
  permitUpdated: 'permit.updated',
  levelReached: 'level.reached',
});

const TRAINEES = DEMO_USERS.filter((u) => u.roles.includes('trainee'));

// Credits for a completed client project (proposal: 5).
export const PROJECT_CREDITS = 5;
const todayUtc = () => new Date().toISOString().slice(0, 10);

function requireTrainee(rawId) {
  const id = parse(traineeParam, rawId);
  if (!TRAINEES.some((t) => t.id === id)) throw badRequest(`"${id}" is not a trainee`);
  return id;
}

export function createCreditService({ store, courses, today = todayUtc }) {
  const canGrade = (user, course) =>
    hasRole(user, 'admin') || (hasRole(user, 'instructor') && course.instructorId === user.id);

  async function loadPendingResult(tx, user, rawId) {
    const result = await tx.findResult(parse(idParam, rawId));
    if (!result) throw notFound('Result not found');
    if (result.status !== 'pending_verification') throw conflict('This result has already been reviewed');
    // Every credit is checked by two people: the one who graded it and an admin.
    if (result.gradedBy === user.id) throw forbidden('You cannot verify a result you graded yourself');
    return result;
  }

  // Everything the level rules need, read in one place. Sequential on purpose:
  // a SQL Server transaction runs one query at a time.
  async function facts(tx, traineeId) {
    const credits = await tx.creditTotal(traineeId);
    const verified = await tx.listResults({ traineeId, status: 'verified' });
    const permit = await tx.getPermit(traineeId);
    const projectsCompleted = await tx.countProjectCredits(traineeId);
    const passedCourses = await Promise.all(verified.map((r) => courses.findById(r.courseId)));
    const passedRequirementLevels = new Set(
      passedCourses.filter((c) => c?.requiredForLevel).map((c) => c.requiredForLevel),
    );
    return {
      credits,
      passedRequirementLevels,
      permitValid: isPermitValid(permit, today()),
      projectsCompleted,
    };
  }

  return {
    /** An instructor (or admin) records a trainee's final grade in a course they manage. */
    async recordResult(user, body) {
      const input = parse(resultInput, body);
      const traineeId = requireTrainee(input.traineeId);
      const course = await courses.findById(input.courseId);
      if (!course) throw notFound('Course not found');
      if (!canGrade(user, course)) throw forbidden('Only the course instructor or an admin can grade it');
      if (await store.hasActiveResult(course.id, traineeId)) {
        throw conflict('This trainee already has a result for this course');
      }
      const passed = input.grade >= course.passMark;
      return store.insertResult({
        courseId: course.id,
        traineeId,
        grade: input.grade,
        status: passed ? 'pending_verification' : 'failed',
        gradedBy: user.id,
      });
    },

    /** Passing results waiting for an admin, oldest first, with their course. */
    async verificationQueue() {
      const pending = await store.listResults({ status: 'pending_verification' });
      return Promise.all(
        pending.map(async (r) => {
          const course = await courses.findById(r.courseId);
          return { ...r, courseTitle: course?.title ?? null, credits: course?.credits ?? 0 };
        }),
      );
    },

    async verify(user, rawId) {
      return store.transaction(async (tx) => {
        const result = await loadPendingResult(tx, user, rawId);
        const course = await courses.findById(result.courseId);
        const updated = await tx.updateResult(result.id, { status: 'verified', reviewedBy: user.id });
        if (course.credits > 0) {
          await tx.appendLedger({
            traineeId: result.traineeId,
            amount: course.credits,
            sourceType: 'course',
            sourceId: result.id,
            reason: `Passed ${course.title}`,
            createdBy: user.id,
          });
          await tx.enqueue(EVENTS.creditsChanged, {
            traineeId: result.traineeId,
            amount: course.credits,
            reason: `Passed ${course.title}`,
          });
        }
        return updated;
      });
    },

    async reject(user, rawId, body) {
      const { reason } = parse(rejectInput, body);
      return store.transaction(async (tx) => {
        const result = await loadPendingResult(tx, user, rawId);
        const course = await courses.findById(result.courseId);
        const updated = await tx.updateResult(result.id, {
          status: 'rejected',
          reviewedBy: user.id,
          rejectReason: reason,
        });
        await tx.enqueue(EVENTS.resultRejected, {
          traineeId: result.traineeId,
          course: course.title,
          reason,
        });
        return updated;
      });
    },

    /** The ledger is append-only: a mistake is fixed with a new entry and a reason. */
    async correct(user, rawTraineeId, body) {
      const traineeId = requireTrainee(rawTraineeId);
      const { amount, reason } = parse(correctionInput, body);
      return store.transaction(async (tx) => {
        const entry = await tx.appendLedger({
          traineeId,
          amount,
          sourceType: 'correction',
          sourceId: null,
          reason,
          createdBy: user.id,
        });
        await tx.enqueue(EVENTS.creditsChanged, { traineeId, amount, reason });
        return entry;
      });
    },

    /**
     * For the projects service (internal API): may this trainee take a project?
     * Only what assignment needs: level, permit validity, paused. No permit dates or documents.
     */
    async eligibility(rawTraineeId) {
      const traineeId = requireTrainee(rawTraineeId);
      const profile = await store.getProfile(traineeId);
      const permit = await store.getPermit(traineeId);
      const trainee = TRAINEES.find((t) => t.id === traineeId);
      return {
        traineeId,
        name: trainee.name,
        level: profile?.level ?? 0,
        permitValid: isPermitValid(permit, today()),
        projectsPaused: profile?.projectsPaused ?? false,
      };
    },

    /**
     * For the projects service (internal API): an approved client project earns
     * PROJECT_CREDITS. Safe to call twice for the same project (the projects
     * outbox may retry): the second call returns the existing entry.
     */
    async awardProjectCredit(body) {
      const { traineeId: rawId, projectId, title } = parse(projectCreditInput, body);
      const traineeId = requireTrainee(rawId);
      return store.transaction(async (tx) => {
        const existing = await tx.findLedgerBySource('project', projectId);
        if (existing) return { entry: existing, created: false };
        const reason = `Completed client project: ${title}`;
        const entry = await tx.appendLedger({
          traineeId,
          amount: PROJECT_CREDITS,
          sourceType: 'project',
          sourceId: projectId,
          reason,
          createdBy: 'projects-service',
        });
        await tx.enqueue(EVENTS.creditsChanged, { traineeId, amount: PROJECT_CREDITS, reason });
        return { entry, created: true };
      });
    },

    /** Called by the outbox handler. Levels only go up; a new level is announced once. */
    async recalculateLevel(traineeId) {
      return store.transaction(async (tx) => {
        const profile = (await tx.getProfile(traineeId)) ?? { traineeId, level: 0, projectsPaused: false };
        const now = standing(await facts(tx, traineeId), profile.level);
        if (now.level > profile.level) {
          await tx.saveProfile({ ...profile, level: now.level });
          await tx.enqueue(EVENTS.levelReached, { traineeId, level: now.level });
        }
        return now.level;
      });
    },

    /** A trainee sees their own progress; staff see any trainee's. Only admins and the trainee see permit data. */
    async progress(user, rawTraineeId) {
      const traineeId = requireTrainee(rawTraineeId);
      const isSelf = user.id === traineeId;
      if (!isSelf && !hasRole(user, 'instructor', 'admin')) throw forbidden();
      const [profile, ledger, f] = await Promise.all([
        store.getProfile(traineeId),
        store.listLedger(traineeId),
        facts(store, traineeId),
      ]);
      const view = {
        traineeId,
        ...standing(f, profile?.level ?? 0),
        projectsPaused: profile?.projectsPaused ?? false,
        ledger,
      };
      if (isSelf || hasRole(user, 'admin')) return view;
      // Instructors never see permit information.
      const { permitValid, ...rest } = view; // eslint-disable-line no-unused-vars
      return {
        ...rest,
        next: rest.next && { ...rest.next, missing: rest.next.missing.filter((m) => m !== 'permit') },
      };
    },

    /** Admin overview of every trainee: level, permit and whether it expires soon. */
    async permitOverview() {
      const day = today();
      return Promise.all(
        TRAINEES.map(async (t) => {
          const [permit, profile] = await Promise.all([store.getPermit(t.id), store.getProfile(t.id)]);
          return {
            traineeId: t.id,
            name: t.name,
            level: profile?.level ?? 0,
            projectsPaused: profile?.projectsPaused ?? false,
            permit: permit ?? null,
            permitValid: isPermitValid(permit, day),
            expiringSoon: isPermitExpiringSoon(permit, day),
          };
        }),
      );
    },

    async setPermit(user, rawTraineeId, body) {
      const traineeId = requireTrainee(rawTraineeId);
      const input = parse(permitInput, body);
      if (input.status === 'verified' && !input.expiresOn) {
        throw badRequest('A verified permit needs an expiry date');
      }
      return store.transaction(async (tx) => {
        const permit = await tx.savePermit({ traineeId, ...input, updatedBy: user.id });
        // A newly valid permit can complete the requirements for a level.
        await tx.enqueue(EVENTS.permitUpdated, { traineeId });
        return permit;
      });
    },

    /** An admin can pause project access, for example when a permit expires; credits and level stay. */
    async setProjectsPaused(user, rawTraineeId, body) {
      const traineeId = requireTrainee(rawTraineeId);
      const { paused } = parse(pausedInput, body);
      const profile = (await store.getProfile(traineeId)) ?? { traineeId, level: 0, projectsPaused: false };
      return store.saveProfile({ ...profile, projectsPaused: paused });
    },

    notifications: (user) => store.listNotifications(user.id),

    async markRead(user, rawId) {
      const done = await store.markNotificationRead(parse(idParam, rawId), user.id);
      if (!done) throw notFound('Notification not found');
    },
  };
}

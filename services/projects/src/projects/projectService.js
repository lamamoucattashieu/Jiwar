// Project requests, workflow, payments, showcase (stories #15 to #18, #25).
// Rules only: the store, the learning client and the payment provider are
// passed in (ports), so the tests run them with in-memory and fake adapters.
import { HttpError, badRequest, forbidden, notFound } from '../http/errors.js';
import { DEMO_USERS, hasRole } from '../http/auth.js';
import { parse } from '../http/validate.js';
import { splitPayout } from '../payments/money.js';
import { allowedActions, nextStatus, relationsOf } from './projectRules.js';
import {
  assignInput,
  idParam,
  messageInput,
  noteInput,
  payInput,
  quoteInput,
  rateInput,
  requestInput,
  traineeParam,
} from './projectSchema.js';

export const EVENTS = Object.freeze({ projectApproved: 'project.approved' });

const TRAINEES = DEMO_USERS.filter((u) => u.roles.includes('trainee'));
// Public pages show a first name only, never contact details, nationality or permits.
const displayName = (id) => TRAINEES.find((t) => t.id === id)?.name.split(' ')[0] ?? null;
const companyName = (id) => DEMO_USERS.find((u) => u.id === id)?.company ?? null;

function eligibilityProblems(e, levelRequired) {
  const problems = [];
  if (e.level < levelRequired) problems.push('level');
  if (!e.permitValid) problems.push('permit');
  if (e.projectsPaused) problems.push('paused');
  return problems;
}

export function createProjectService({ store, learning, payments }) {
  async function load(user, rawId) {
    const project = await store.findProject(parse(idParam, rawId));
    if (!project) throw notFound('Project not found');
    // Admins, the company that asked and the assigned trainee; nobody else.
    if (relationsOf(user, project).length === 0) throw notFound('Project not found');
    return project;
  }

  /** Validates the action, applies the changes and records the step, in one transaction. */
  async function transition(tx, user, project, action, changes = {}, note = null) {
    const to = nextStatus(action, user, project);
    const updated = await tx.updateProject(project.id, { ...changes, status: to });
    await tx.addEvent({ projectId: project.id, action, from: project.status, to, actorId: user.id, note });
    return updated;
  }

  return {
    packs: () => store.listPacks(),

    /** A company asks for a pack (quoted at once, fixed price) or a custom project (admin quotes). */
    async request(user, body) {
      const input = parse(requestInput, body);
      const pack = input.packCode ? await store.findPack(input.packCode) : null;
      if (input.preferredTraineeId && !TRAINEES.some((t) => t.id === input.preferredTraineeId)) {
        throw badRequest('The preferred trainee does not exist');
      }
      return store.transaction(async (tx) => {
        const project = await tx.insertProject({
          ...input,
          companyId: user.id,
          status: pack ? 'quoted' : 'requested',
          levelRequired: pack?.levelRequired ?? null,
          setupFeeJd: pack?.setupFeeJd ?? null,
          priceJd: pack?.priceJd ?? null,
        });
        await tx.addEvent({
          projectId: project.id,
          action: 'request',
          from: 'new',
          to: project.status,
          actorId: user.id,
          note: pack ? `${pack.name}: fixed price` : 'Custom request',
        });
        return project;
      });
    },

    async list(user, query = {}) {
      if (hasRole(user, 'admin')) return store.listProjects({ status: query.status });
      if (hasRole(user, 'company')) return store.listProjects({ companyId: user.id });
      if (hasRole(user, 'trainee')) return store.listProjects({ traineeId: user.id });
      throw forbidden('Instructors do not manage client projects');
    },

    /** Everything the project page shows, filtered to what this user may see. */
    async details(user, rawId) {
      const project = await load(user, rawId);
      const relations = relationsOf(user, project);
      const [events, messages, invoices, payout] = await Promise.all([
        store.listEvents(project.id),
        store.listMessages(project.id),
        relations.includes('admin') || relations.includes('owner')
          ? store.listInvoices({ projectId: project.id })
          : [],
        relations.includes('admin') || relations.includes('assignee') ? store.findPayout(project.id) : null,
      ]);
      return {
        ...project,
        companyName: companyName(project.companyId),
        traineeName: displayName(project.traineeId),
        actions: allowedActions(user, project),
        events,
        messages,
        invoices,
        payout,
      };
    },

    async quote(user, rawId, body) {
      const input = parse(quoteInput, body);
      const project = await load(user, rawId);
      return store.transaction((tx) => transition(tx, user, project, 'quote', input));
    },

    /** The company accepts the quote and pays the setup fee (mock gateway). */
    async accept(user, rawId, body) {
      const { simulateDecline } = parse(payInput, body);
      const project = await load(user, rawId);
      nextStatus('accept', user, project); // check before charging anything
      const { paymentRef } = await payments.charge({
        amountJd: project.setupFeeJd,
        reference: `p${project.id}-setup`,
        simulateDecline,
      });
      return store.transaction(async (tx) => {
        await tx.addInvoice({
          projectId: project.id,
          kind: 'setup_fee',
          amountJd: project.setupFeeJd,
          paymentRef,
        });
        return transition(tx, user, project, 'accept');
      });
    },

    /**
     * Trainees who may take this project, from the learning service. If learning
     * is down this fails with a clear 503 and the rest of the service is unaffected.
     */
    async candidates(user, rawId) {
      const project = await load(user, rawId);
      if (!hasRole(user, 'admin')) throw forbidden('Only admins assign projects');
      const levelRequired = project.levelRequired ?? 1;
      const all = await Promise.all(TRAINEES.map((t) => learning.eligibility(t.id)));
      return all.map((e) => {
        const problems = eligibilityProblems(e, levelRequired);
        return {
          ...e,
          eligible: problems.length === 0,
          problems,
          preferred: e.traineeId === project.preferredTraineeId,
        };
      });
    },

    async assign(user, rawId, body) {
      const { traineeId } = parse(assignInput, body);
      const project = await load(user, rawId);
      nextStatus('assign', user, project);
      if (!TRAINEES.some((t) => t.id === traineeId)) throw badRequest('Not a trainee');
      const e = await learning.eligibility(traineeId);
      const problems = eligibilityProblems(e, project.levelRequired ?? 1);
      if (problems.length > 0) {
        throw new HttpError(409, `This trainee cannot take this project yet (${problems.join(', ')})`);
      }
      return store.transaction((tx) => transition(tx, user, project, 'assign', { traineeId }));
    },

    async submit(user, rawId, body) {
      const { note } = parse(noteInput, body);
      const project = await load(user, rawId);
      return store.transaction((tx) => transition(tx, user, project, 'submit', {}, note || null));
    },

    async requestRevision(user, rawId, body) {
      const { note } = parse(noteInput, body);
      if (!note) throw badRequest('Say what should change');
      const project = await load(user, rawId);
      return store.transaction((tx) =>
        transition(tx, user, project, 'request_revision', { revisionsUsed: project.revisionsUsed + 1 }, note),
      );
    },

    /**
     * The company approves the delivery and pays the price; the trainee's payout
     * is recorded and the learning service is told (through the outbox) to add
     * the project's credits, even if it is down right now.
     */
    async approve(user, rawId, body) {
      const { simulateDecline } = parse(payInput, body);
      const project = await load(user, rawId);
      nextStatus('approve', user, project);
      const { paymentRef } = await payments.charge({
        amountJd: project.priceJd,
        reference: `p${project.id}-price`,
        simulateDecline,
      });
      const { traineeJd, jiwarJd } = splitPayout(project.priceJd);
      return store.transaction(async (tx) => {
        await tx.addInvoice({
          projectId: project.id,
          kind: 'project_price',
          amountJd: project.priceJd,
          paymentRef,
        });
        await tx.addPayout({
          projectId: project.id,
          traineeId: project.traineeId,
          amountJd: traineeJd,
          jiwarShareJd: jiwarJd,
        });
        await tx.enqueue(EVENTS.projectApproved, {
          projectId: project.id,
          traineeId: project.traineeId,
          title: project.title,
        });
        return transition(tx, user, project, 'approve');
      });
    },

    async cancel(user, rawId) {
      const project = await load(user, rawId);
      return store.transaction((tx) => transition(tx, user, project, 'cancel'));
    },

    async rate(user, rawId, body) {
      const input = parse(rateInput, body);
      const project = await load(user, rawId);
      if (!relationsOf(user, project).includes('owner'))
        throw forbidden('Only the company can rate its project');
      if (project.status !== 'approved') throw new HttpError(409, 'Rate a project after approving it');
      return store.updateProject(project.id, input);
    },

    async addMessage(user, rawId, body) {
      const { body: text } = parse(messageInput, body);
      const project = await load(user, rawId);
      return store.addMessage({ projectId: project.id, authorId: user.id, body: text });
    },

    /** Public: approved projects, with testimonials only where the company agreed. */
    async showcase() {
      const approved = await store.listProjects({ status: 'approved' });
      const packs = await store.listPacks();
      return approved.map((p) => ({
        id: p.id,
        title: p.title,
        pack: packs.find((k) => k.code === p.packCode)?.name ?? 'Custom project',
        company: companyName(p.companyId),
        trainee: displayName(p.traineeId),
        traineeId: p.traineeId,
        rating: p.rating,
        testimonial: p.testimonialPublic ? p.testimonial : null,
      }));
    },

    /** Public portfolio. The level comes from learning; if it is down, the page still works without it. */
    async portfolio(rawTraineeId) {
      const traineeId = parse(traineeParam, rawTraineeId);
      if (!TRAINEES.some((t) => t.id === traineeId)) throw notFound('Portfolio not found');
      const projects = (await this.showcase()).filter((p) => p.traineeId === traineeId);
      let level = null;
      try {
        level = (await learning.eligibility(traineeId)).level;
      } catch {
        // Partial failure: show the portfolio without the level badge.
      }
      return { traineeId, name: displayName(traineeId), level, projects };
    },

    async invoices(user) {
      if (hasRole(user, 'admin')) return store.listInvoices({});
      if (hasRole(user, 'company')) return store.listInvoices({ companyId: user.id });
      throw forbidden();
    },

    async payouts(user) {
      if (hasRole(user, 'admin')) return store.listPayouts({});
      if (hasRole(user, 'trainee')) return store.listPayouts({ traineeId: user.id });
      throw forbidden();
    },
  };
}

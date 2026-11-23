// In-memory adapter for the project store port: tests, and running without
// DATABASE_URL. transaction() rolls back on error, like SQL Server.
const now = () => new Date().toISOString();
const copy = (x) => structuredClone(x);

// The same packs as migration 002.
export const DEFAULT_PACKS = Object.freeze([
  {
    code: 'website',
    name: 'One-week website',
    summary: 'A mobile-friendly site of up to 5 pages.',
    deliveryDays: 7,
    setupFeeJd: 30,
    priceJd: 150,
    levelRequired: 1,
  },
  {
    code: 'whatsapp-bot',
    name: 'WhatsApp order bot',
    summary: 'Customers order over WhatsApp.',
    deliveryDays: 10,
    setupFeeJd: 50,
    priceJd: 350,
    levelRequired: 2,
  },
  {
    code: 'ai-assistant',
    name: 'AI reply assistant',
    summary: 'Drafts replies to customers.',
    deliveryDays: 14,
    setupFeeJd: 80,
    priceJd: 500,
    levelRequired: 3,
  },
]);

export function createMemoryProjectStore({ packs = DEFAULT_PACKS } = {}) {
  let state = {
    seq: { project: 1, event: 1, message: 1, invoice: 1, payout: 1, outbox: 1 },
    projects: [],
    events: [],
    messages: [],
    invoices: [],
    payouts: [],
    outbox: [],
  };
  const add = (table, seq, row) => {
    const full = { ...row, id: state.seq[seq]++, createdAt: now() };
    state[table].push(full);
    return copy(full);
  };

  const store = {
    async transaction(fn) {
      const before = copy(state);
      try {
        return await fn(store);
      } catch (err) {
        state = before;
        throw err;
      }
    },

    listPacks: async () => copy(packs),
    findPack: async (code) => copy(packs.find((p) => p.code === code) ?? null),

    async insertProject(p) {
      return add('projects', 'project', {
        companyId: p.companyId,
        packCode: p.packCode,
        title: p.title,
        goals: p.goals,
        features: p.features,
        examples: p.examples,
        deadline: p.deadline,
        status: p.status,
        levelRequired: p.levelRequired,
        setupFeeJd: p.setupFeeJd,
        priceJd: p.priceJd,
        preferredTraineeId: p.preferredTraineeId,
        traineeId: null,
        revisionsUsed: 0,
        maxRevisions: 2,
        rating: null,
        testimonial: null,
        testimonialPublic: false,
        updatedAt: now(),
      });
    },
    async findProject(id) {
      const p = state.projects.find((x) => x.id === id);
      return p ? copy(p) : null;
    },
    async listProjects({ companyId, traineeId, status }) {
      return copy(
        state.projects
          .filter(
            (p) => (!companyId || p.companyId === companyId) && (!traineeId || p.traineeId === traineeId),
          )
          .filter((p) => !status || p.status === status)
          .reverse(),
      );
    },
    async updateProject(id, changes) {
      const p = state.projects.find((x) => x.id === id);
      Object.assign(p, changes, { updatedAt: now() });
      return copy(p);
    },

    addEvent: async (e) => add('events', 'event', e),
    listEvents: async (projectId) => copy(state.events.filter((e) => e.projectId === projectId)),
    addMessage: async (m) => add('messages', 'message', m),
    listMessages: async (projectId) => copy(state.messages.filter((m) => m.projectId === projectId)),

    async addInvoice(i) {
      if (state.invoices.some((x) => x.projectId === i.projectId && x.kind === i.kind)) {
        throw new Error('duplicate invoice');
      }
      return add('invoices', 'invoice', { ...i, paidAt: now() });
    },
    async listInvoices({ projectId, companyId }) {
      const projectIds = companyId
        ? new Set(state.projects.filter((p) => p.companyId === companyId).map((p) => p.id))
        : null;
      return copy(
        state.invoices.filter(
          (i) => (!projectId || i.projectId === projectId) && (!projectIds || projectIds.has(i.projectId)),
        ),
      );
    },

    addPayout: async (p) => add('payouts', 'payout', p),
    findPayout: async (projectId) => copy(state.payouts.find((p) => p.projectId === projectId) ?? null),
    listPayouts: async ({ traineeId }) =>
      copy(state.payouts.filter((p) => !traineeId || p.traineeId === traineeId)),

    async enqueue(type, payload) {
      state.outbox.push({
        id: state.seq.outbox++,
        type,
        payload: copy(payload),
        processedAt: null,
        attempts: 0,
      });
    },
    pendingEvents: async (limit, maxAttempts) =>
      copy(state.outbox.filter((e) => !e.processedAt && e.attempts < maxAttempts).slice(0, limit)),
    async markEventProcessed(id) {
      state.outbox.find((e) => e.id === id).processedAt = now();
    },
    async markEventFailed(id, error) {
      const e = state.outbox.find((x) => x.id === id);
      e.attempts += 1;
      e.lastError = error;
    },
  };
  return store;
}

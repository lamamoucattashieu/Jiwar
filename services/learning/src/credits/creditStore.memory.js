// In-memory adapter for the credit store port. Used by the tests and when the
// service runs without DATABASE_URL. transaction() really rolls back on error,
// so tests catch half-finished changes the same way SQL Server would.
const now = () => new Date().toISOString();
const copy = (x) => structuredClone(x);

export function createMemoryCreditStore() {
  let state = {
    seq: { result: 1, ledger: 1, notification: 1, event: 1 },
    results: [],
    ledger: [],
    permits: {},
    profiles: {},
    notifications: [],
    outbox: [],
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

    async insertResult(r) {
      const row = { ...r, id: state.seq.result++, gradedAt: now(), reviewedBy: null, rejectReason: null };
      state.results.push(row);
      return copy(row);
    },
    async findResult(id) {
      const r = state.results.find((x) => x.id === id);
      return r ? copy(r) : null;
    },
    async listResults({ status, traineeId }) {
      return copy(
        state.results.filter(
          (r) => (!status || r.status === status) && (!traineeId || r.traineeId === traineeId),
        ),
      );
    },
    async hasActiveResult(courseId, traineeId) {
      return state.results.some(
        (r) =>
          r.courseId === courseId &&
          r.traineeId === traineeId &&
          ['pending_verification', 'verified'].includes(r.status),
      );
    },
    async updateResult(id, changes) {
      const r = state.results.find((x) => x.id === id);
      Object.assign(r, changes, { reviewedAt: now() });
      return copy(r);
    },

    async appendLedger(entry) {
      const row = { ...entry, id: state.seq.ledger++, createdAt: now() };
      state.ledger.push(row);
      return copy(row);
    },
    async listLedger(traineeId) {
      return copy(state.ledger.filter((e) => e.traineeId === traineeId).reverse());
    },
    async creditTotal(traineeId) {
      return state.ledger.filter((e) => e.traineeId === traineeId).reduce((sum, e) => sum + e.amount, 0);
    },
    async countProjectCredits(traineeId) {
      return state.ledger.filter((e) => e.traineeId === traineeId && e.sourceType === 'project').length;
    },

    async getPermit(traineeId) {
      return state.permits[traineeId] ? copy(state.permits[traineeId]) : null;
    },
    async savePermit(p) {
      state.permits[p.traineeId] = { ...p, updatedAt: now() };
      return copy(state.permits[p.traineeId]);
    },

    async getProfile(traineeId) {
      return state.profiles[traineeId] ? copy(state.profiles[traineeId]) : null;
    },
    async saveProfile(p) {
      state.profiles[p.traineeId] = { ...p };
      return copy(p);
    },

    async addNotification({ userId, kind, data, eventId }) {
      const duplicate = state.notifications.some(
        (n) => eventId && n.eventId === eventId && n.userId === userId && n.kind === kind,
      );
      if (duplicate) return;
      state.notifications.push({
        id: state.seq.notification++,
        userId,
        kind,
        data,
        eventId,
        createdAt: now(),
        readAt: null,
      });
    },
    async listNotifications(userId) {
      return copy(
        state.notifications
          .filter((n) => n.userId === userId)
          .reverse()
          .map(({ eventId, ...n }) => n), // eslint-disable-line no-unused-vars
      );
    },
    async markNotificationRead(id, userId) {
      const n = state.notifications.find((x) => x.id === id && x.userId === userId);
      if (!n) return false;
      n.readAt ??= now();
      return true;
    },

    async enqueue(type, payload) {
      state.outbox.push({
        id: state.seq.event++,
        type,
        payload: copy(payload),
        processedAt: null,
        attempts: 0,
      });
    },
    async pendingEvents(limit, maxAttempts) {
      return copy(state.outbox.filter((e) => !e.processedAt && e.attempts < maxAttempts).slice(0, limit));
    },
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

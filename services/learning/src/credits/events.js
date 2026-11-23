// Transactional outbox (Observer, made reliable). A change writes its event to the
// outbox in the same transaction, so the event exists if and only if the change
// was saved. The dispatcher then runs the handlers; a handler that fails is
// retried later, and a crash between saving and handling loses nothing.
import { EVENTS } from './creditService.js';

export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const MAX_ROUNDS = 5; // handlers may add events (credits -> level); follow the chain a few steps

export function createEventHandlers({ service, store }) {
  const notify = (event, userId, kind, data) =>
    store.addNotification({ userId, kind, data, eventId: event.id });

  return {
    [EVENTS.creditsChanged]: async (p, event) => {
      await notify(event, p.traineeId, 'creditsChanged', { amount: p.amount, reason: p.reason });
      await service.recalculateLevel(p.traineeId);
    },
    [EVENTS.resultRejected]: (p, event) =>
      notify(event, p.traineeId, 'resultRejected', { course: p.course, reason: p.reason }),
    [EVENTS.permitUpdated]: (p) => service.recalculateLevel(p.traineeId),
    [EVENTS.levelReached]: (p, event) => notify(event, p.traineeId, 'levelReached', { level: p.level }),
  };
}

export function createOutboxDispatcher({ store, handlers, log = () => {} }) {
  async function handle(event) {
    const handler = handlers[event.type];
    try {
      if (!handler) throw new Error(`No handler for ${event.type}`);
      await handler(event.payload, event);
      await store.markEventProcessed(event.id);
      return true;
    } catch (err) {
      await store.markEventFailed(event.id, err.message);
      log(JSON.stringify({ msg: 'outbox event failed', id: event.id, type: event.type, error: err.message }));
      return false;
    }
  }

  return {
    /** Delivers pending events. Safe to call at any time; returns how many succeeded. */
    async drain() {
      let delivered = 0;
      const failedThisRun = new Set(); // retried on a later drain, not straight away
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const events = (await store.pendingEvents(BATCH_SIZE, MAX_ATTEMPTS)).filter(
          (e) => !failedThisRun.has(e.id),
        );
        if (events.length === 0) break;
        for (const event of events) {
          if (await handle(event)) delivered += 1;
          else failedThisRun.add(event.id);
        }
      }
      return delivered;
    },
  };
}

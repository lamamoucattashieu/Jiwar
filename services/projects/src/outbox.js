// Transactional outbox dispatcher (same pattern as the learning service, ADR-1).
// Events are written in the same transaction as the change; this delivers them
// and retries failures on a later run. The services share no code on purpose,
// so each can be built and deployed on its own.
export const MAX_ATTEMPTS = 8; // a learning outage can last a while
const BATCH_SIZE = 20;

export function createOutboxDispatcher({ store, handlers, log = () => {} }) {
  return {
    async drain() {
      let delivered = 0;
      for (const event of await store.pendingEvents(BATCH_SIZE, MAX_ATTEMPTS)) {
        try {
          const handler = handlers[event.type];
          if (!handler) throw new Error(`No handler for ${event.type}`);
          await handler(event.payload, event);
          await store.markEventProcessed(event.id);
          delivered += 1;
        } catch (err) {
          await store.markEventFailed(event.id, err.message);
          log(
            JSON.stringify({
              msg: 'outbox event failed',
              id: event.id,
              type: event.type,
              error: err.message,
            }),
          );
        }
      }
      return delivered;
    },
  };
}

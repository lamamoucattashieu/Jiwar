// The PaymentProvider port (Strategy): anything with
//   charge({ amountJd, reference, simulateDecline }) -> Promise<{ paymentRef }>
// that rejects with a 402 HttpError when the payment is declined.
//
// Real payments are out of the assignment's scope, so the platform ships with
// this mock. A real gateway (PayTabs, MEPS) would be another adapter with the
// same method, chosen in server.js; nothing else would change.
import { randomUUID } from 'node:crypto';
import { HttpError } from '../http/errors.js';

export function createMockPaymentProvider() {
  return {
    async charge({ amountJd, reference, simulateDecline = false }) {
      if (simulateDecline) {
        throw new HttpError(402, 'The card was declined (test payment). Nothing was charged.');
      }
      if (!(amountJd > 0)) throw new HttpError(400, 'Nothing to charge');
      return { paymentRef: `mock-${reference}-${randomUUID().slice(0, 8)}` };
    },
  };
}

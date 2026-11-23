// Money rules (story #17). Training is free for trainees; money comes in from
// companies and goes out to trainees: the trainee earns 80% of the project price
// and Jiwar keeps 20%. Amounts are dinars with 2 decimals, computed in cents so
// rounding never creates or loses money.
export const TRAINEE_SHARE = 0.8;

const toCents = (jd) => Math.round(Number(jd) * 100);

export function splitPayout(priceJd) {
  const total = toCents(priceJd);
  const trainee = Math.round(total * TRAINEE_SHARE);
  return { traineeJd: trainee / 100, jiwarJd: (total - trainee) / 100 };
}

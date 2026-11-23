import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
const demoId = z.string().trim().min(1).max(50);
const jd = z.number().positive().max(100_000).multipleOf(0.01);

// The guided brief a company fills in (story #15). No pack = custom request.
export const requestInput = z.object({
  packCode: z.enum(['website', 'whatsapp-bot', 'ai-assistant']).nullable().default(null),
  title: text(200).min(3),
  goals: text(2000).min(10),
  features: text(2000).default(''),
  examples: text(1000).default(''),
  deadline: z.iso.date().nullable().default(null),
  preferredTraineeId: demoId.nullable().default(null),
});

export const quoteInput = z.object({
  setupFeeJd: jd,
  priceJd: jd,
  levelRequired: z.number().int().min(1).max(3),
});

export const payInput = z.object({ simulateDecline: z.boolean().default(false) });
export const assignInput = z.object({ traineeId: demoId });
export const noteInput = z.object({ note: text(500).default('') });
export const messageInput = z.object({ body: text(2000).min(1) });

export const rateInput = z.object({
  rating: z.number().int().min(1).max(5),
  testimonial: text(1000).default(''),
  testimonialPublic: z.boolean().default(false),
});

export const idParam = z.coerce.number().int().positive();
export const traineeParam = demoId;

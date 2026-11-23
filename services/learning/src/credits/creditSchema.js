import { z } from 'zod';

const demoId = z.string().trim().min(1).max(50);

export const resultInput = z.object({
  courseId: z.number().int().positive(),
  traineeId: demoId,
  grade: z.number().int().min(0).max(100),
});

export const rejectInput = z.object({
  reason: z.string().trim().min(3).max(500),
});

// Corrections can add or remove credits, never zero.
export const correctionInput = z.object({
  amount: z
    .number()
    .int()
    .min(-200)
    .max(200)
    .refine((n) => n !== 0, 'must not be 0'),
  reason: z.string().trim().min(3).max(500),
});

export const permitInput = z.object({
  status: z.enum(['pending', 'verified']),
  expiresOn: z.iso.date().nullable().default(null),
});

export const pausedInput = z.object({ paused: z.boolean() });

export const idParam = z.coerce.number().int().positive();
export const traineeParam = demoId;

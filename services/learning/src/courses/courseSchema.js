import { z } from 'zod';

export const COURSE_TYPES = ['module', 'live_class', 'workshop'];

// What an instructor sends to create or replace a course.
export const courseInput = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).default(''),
  type: z.enum(COURSE_TYPES),
  credits: z.number().int().min(0).max(50),
  passMark: z.number().int().min(0).max(100).default(60),
  published: z.boolean().default(false),
});

export const listQuery = z.object({
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  type: z.enum(COURSE_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParam = z.coerce.number().int().positive();

import { z } from 'zod';

export const MAX_FILES = 30;
export const MAX_FILE_CHARS = 50_000;
export const MAIN = 'main';

// Relative paths with folders, no "..", no leading slash: index.html, css/site.css
const path = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/, 'letters, digits, . _ - and / only')
  .refine((p) => !p.split('/').some((part) => part === '..' || part === ''), 'no empty or ".." parts');

const branchName = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9._/-]{0,48}$/, 'lowercase letters, digits, . _ - and /, up to 49 characters');

export const commitInput = z.object({
  branch: branchName,
  message: z.string().trim().min(3).max(500),
  files: z
    .array(z.object({ path, content: z.string().max(MAX_FILE_CHARS) }))
    .min(1)
    .max(MAX_FILES)
    .refine((files) => new Set(files.map((f) => f.path)).size === files.length, 'each path only once'),
});

export const branchInput = z.object({ name: branchName, from: branchName.default(MAIN) });

export const pullInput = z.object({
  source: branchName,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(''),
});

export const commentInput = z.object({
  path: path.nullable().default(null),
  line: z.number().int().positive().nullable().default(null),
  body: z.string().trim().min(1).max(2000),
});

export const changesInput = z.object({ body: z.string().trim().min(3).max(2000) });
export const approveInput = z.object({ grade: z.number().int().min(0).max(100).nullable().default(null) });
export const branchQuery = z.object({ branch: branchName.default(MAIN) });
export const idParam = z.coerce.number().int().positive();

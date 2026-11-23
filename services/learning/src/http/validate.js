import { badRequest } from './errors.js';

// Parses untrusted input with a zod schema. On failure it throws a 400 that
// lists each field and what is wrong with it.
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw badRequest('Some fields are not valid', details);
  }
  return result.data;
}

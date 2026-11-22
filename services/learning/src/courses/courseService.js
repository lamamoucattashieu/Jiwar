// Course rules, independent of HTTP and of the database. The repository is
// passed in (a port), so the same rules run against SQL Server in production
// and an in-memory store in tests.
import { forbidden, notFound } from '../http/errors.js';
import { hasRole } from '../http/auth.js';
import { parse } from '../http/validate.js';
import { courseInput, idParam, listQuery } from './courseSchema.js';

const canManage = (user, course) =>
  hasRole(user, 'admin') || (hasRole(user, 'instructor') && course.instructorId === user.id);

// Trainees, companies and visitors only ever see published courses.
const canSee = (user, course) => course.published || canManage(user, course);

export function createCourseService(repo) {
  async function load(user, rawId) {
    const course = await repo.findById(parse(idParam, rawId));
    if (!course || !canSee(user, course)) throw notFound('Course not found');
    return course;
  }

  return {
    async list(user, rawQuery) {
      const q = parse(listQuery, rawQuery);
      const filter = { type: q.type, limit: q.limit, offset: q.offset };
      if (q.mine) {
        if (!hasRole(user, 'instructor')) throw forbidden('Only instructors have their own courses');
        filter.instructorId = user.id;
      } else if (!hasRole(user, 'admin')) {
        filter.published = true;
      }
      return repo.list(filter);
    },

    get: load,

    async create(user, body) {
      const input = parse(courseInput, body);
      return repo.insert({ ...input, instructorId: user.id });
    },

    async update(user, rawId, body) {
      const course = await load(user, rawId);
      if (!canManage(user, course)) throw forbidden('Only the course instructor or an admin can edit it');
      return repo.update(course.id, parse(courseInput, body));
    },

    async remove(user, rawId) {
      const course = await load(user, rawId);
      if (!canManage(user, course)) throw forbidden('Only the course instructor or an admin can delete it');
      await repo.remove(course.id);
    },
  };
}

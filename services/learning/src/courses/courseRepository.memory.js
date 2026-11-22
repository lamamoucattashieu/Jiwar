// In-memory adapter for the course repository port. Used by the tests, and
// when the service runs without DATABASE_URL.
export function createMemoryCourseRepository(seed = []) {
  let nextId = 1;
  const rows = new Map();
  const now = () => new Date().toISOString();

  const insert = async (c) => {
    const course = { ...c, id: nextId++, createdAt: now(), updatedAt: now() };
    rows.set(course.id, course);
    return { ...course };
  };
  seed.forEach(insert);

  return {
    async list({ published, instructorId, type, limit, offset }) {
      return [...rows.values()]
        .filter((c) => published === undefined || c.published === published)
        .filter((c) => !instructorId || c.instructorId === instructorId)
        .filter((c) => !type || c.type === type)
        .sort((a, b) => b.id - a.id)
        .slice(offset, offset + limit)
        .map((c) => ({ ...c }));
    },
    async findById(id) {
      const c = rows.get(id);
      return c ? { ...c } : null;
    },
    insert,
    async update(id, c) {
      const course = { ...rows.get(id), ...c, updatedAt: now() };
      rows.set(id, course);
      return { ...course };
    },
    async remove(id) {
      rows.delete(id);
    },
  };
}

// Course notes for the tutor: a SQL Server adapter and an in-memory one.
export function createSqlNoteRepository(db) {
  return {
    async listNotes(courseId) {
      return db.query('SELECT id, title, body FROM course_notes WHERE course_id = @courseId ORDER BY id', {
        courseId,
      });
    },
  };
}

export function createMemoryNoteRepository(notes = []) {
  return {
    async listNotes(courseId) {
      return notes.filter((n) => n.courseId === courseId).map(({ id, title, body }) => ({ id, title, body }));
    },
  };
}

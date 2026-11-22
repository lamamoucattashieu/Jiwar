// SQL Server adapter for the course repository port.
import { conflict } from '../http/errors.js';

// SQL Server error 547: a foreign key (here, a course result) still points at the row.
const FOREIGN_KEY_VIOLATION = 547;

const COLUMNS = `id, title, description, type, credits, pass_mark, instructor_id, published,
  required_for_level, created_at, updated_at`;

const toCourse = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  type: row.type,
  credits: row.credits,
  passMark: row.pass_mark,
  instructorId: row.instructor_id,
  published: Boolean(row.published),
  requiredForLevel: row.required_for_level ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createSqlCourseRepository(db) {
  return {
    async list({ published, instructorId, type, limit, offset }) {
      const where = [];
      const params = { limit, offset };
      if (published !== undefined) {
        where.push('published = @published');
        params.published = published;
      }
      if (instructorId) {
        where.push('instructor_id = @instructorId');
        params.instructorId = instructorId;
      }
      if (type) {
        where.push('type = @type');
        params.type = type;
      }
      const rows = await db.query(
        `SELECT ${COLUMNS} FROM courses
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        params,
      );
      return rows.map(toCourse);
    },

    async findById(id) {
      const rows = await db.query(`SELECT ${COLUMNS} FROM courses WHERE id = @id`, { id });
      return rows[0] ? toCourse(rows[0]) : null;
    },

    async insert(c) {
      const rows = await db.query(
        `INSERT INTO courses (title, description, type, credits, pass_mark, instructor_id, published, required_for_level)
         OUTPUT ${COLUMNS.replace(/(\w+)/g, 'INSERTED.$1')}
         VALUES (@title, @description, @type, @credits, @passMark, @instructorId, @published, @requiredForLevel)`,
        c,
      );
      return toCourse(rows[0]);
    },

    async update(id, c) {
      const rows = await db.query(
        `UPDATE courses SET title = @title, description = @description, type = @type,
           credits = @credits, pass_mark = @passMark, published = @published,
           required_for_level = @requiredForLevel, updated_at = SYSUTCDATETIME()
         OUTPUT ${COLUMNS.replace(/(\w+)/g, 'INSERTED.$1')}
         WHERE id = @id`,
        { ...c, id },
      );
      return toCourse(rows[0]);
    },

    async remove(id) {
      try {
        await db.query('DELETE FROM courses WHERE id = @id', { id });
      } catch (err) {
        if (err.number === FOREIGN_KEY_VIOLATION) {
          throw conflict('This course has graded results, so it cannot be deleted. Unpublish it instead.');
        }
        throw err;
      }
    },
  };
}

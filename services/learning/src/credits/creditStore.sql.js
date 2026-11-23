import { conflict } from '../http/errors.js';

// SQL Server adapter for the credit store port. Every query is parameterised.
// The same functions run on the pool or inside a transaction: transaction(fn)
// hands fn a store bound to the transaction.
const RESULT_COLUMNS = `id, course_id, trainee_id, grade, status, graded_by, graded_at,
  reviewed_by, reviewed_at, reject_reason`;

const toResult = (r) => ({
  id: r.id,
  courseId: r.course_id,
  traineeId: r.trainee_id,
  grade: r.grade,
  status: r.status,
  gradedBy: r.graded_by,
  gradedAt: r.graded_at,
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at,
  rejectReason: r.reject_reason,
});

const toEntry = (e) => ({
  id: e.id,
  traineeId: e.trainee_id,
  amount: e.amount,
  sourceType: e.source_type,
  sourceId: e.source_id,
  reason: e.reason,
  createdBy: e.created_by,
  createdAt: e.created_at,
});

// DATE columns come back as JavaScript dates; the rules compare ISO day strings.
const toDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ?? null));

const toPermit = (p) => ({
  traineeId: p.trainee_id,
  status: p.status,
  expiresOn: toDay(p.expires_on),
  updatedBy: p.updated_by,
  updatedAt: p.updated_at,
});

const toProfile = (p) => ({
  traineeId: p.trainee_id,
  level: p.level,
  projectsPaused: Boolean(p.projects_paused),
});

const toNotification = (n) => ({
  id: n.id,
  userId: n.user_id,
  kind: n.kind,
  data: JSON.parse(n.data),
  createdAt: n.created_at,
  readAt: n.read_at,
});

// SQL Server error 2601: a unique index refused a duplicate row.
const DUPLICATE_KEY = 2601;

export function createSqlCreditStore(db) {
  const one = async (text, params) => (await db.query(text, params))[0] ?? null;

  return {
    transaction: (fn) => db.transaction((tx) => fn(createSqlCreditStore(tx))),

    async insertResult(r) {
      try {
        const row = await one(
          `INSERT INTO course_results (course_id, trainee_id, grade, status, graded_by)
           OUTPUT ${RESULT_COLUMNS.replace(/(\w+)/g, 'INSERTED.$1')}
           VALUES (@courseId, @traineeId, @grade, @status, @gradedBy)`,
          r,
        );
        return toResult(row);
      } catch (err) {
        // Two graders at the same moment: the unique index keeps one active result.
        if (err.number === DUPLICATE_KEY) throw conflict('This trainee already has a result for this course');
        throw err;
      }
    },
    async findResult(id) {
      const row = await one(`SELECT ${RESULT_COLUMNS} FROM course_results WHERE id = @id`, { id });
      return row && toResult(row);
    },
    async listResults({ status, traineeId }) {
      const where = [];
      const params = {};
      if (status) {
        where.push('status = @status');
        params.status = status;
      }
      if (traineeId) {
        where.push('trainee_id = @traineeId');
        params.traineeId = traineeId;
      }
      const rows = await db.query(
        `SELECT ${RESULT_COLUMNS} FROM course_results
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY graded_at, id`,
        params,
      );
      return rows.map(toResult);
    },
    async hasActiveResult(courseId, traineeId) {
      const row = await one(
        `SELECT TOP 1 1 AS found FROM course_results
         WHERE course_id = @courseId AND trainee_id = @traineeId
           AND status IN ('pending_verification', 'verified')`,
        { courseId, traineeId },
      );
      return Boolean(row);
    },
    async updateResult(id, { status, reviewedBy, rejectReason = null }) {
      const row = await one(
        `UPDATE course_results
         SET status = @status, reviewed_by = @reviewedBy, reviewed_at = SYSUTCDATETIME(),
             reject_reason = @rejectReason
         OUTPUT ${RESULT_COLUMNS.replace(/(\w+)/g, 'INSERTED.$1')}
         WHERE id = @id`,
        { id, status, reviewedBy, rejectReason },
      );
      return toResult(row);
    },

    async appendLedger(e) {
      // No OUTPUT clause: SQL Server refuses OUTPUT without INTO on a table with a
      // trigger, and the ledger has the append-only trigger.
      const row = await one(
        `INSERT INTO credit_ledger (trainee_id, amount, source_type, source_id, reason, created_by)
         VALUES (@traineeId, @amount, @sourceType, @sourceId, @reason, @createdBy);
         SELECT * FROM credit_ledger WHERE id = SCOPE_IDENTITY();`,
        e,
      );
      return toEntry(row);
    },
    async listLedger(traineeId) {
      const rows = await db.query(
        'SELECT * FROM credit_ledger WHERE trainee_id = @traineeId ORDER BY created_at DESC, id DESC',
        { traineeId },
      );
      return rows.map(toEntry);
    },
    async creditTotal(traineeId) {
      const row = await one(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM credit_ledger WHERE trainee_id = @traineeId',
        { traineeId },
      );
      return row.total;
    },
    async countProjectCredits(traineeId) {
      const row = await one(
        `SELECT COUNT(*) AS n FROM credit_ledger
         WHERE trainee_id = @traineeId AND source_type = 'project'`,
        { traineeId },
      );
      return row.n;
    },

    async getPermit(traineeId) {
      const row = await one('SELECT * FROM work_permits WHERE trainee_id = @traineeId', { traineeId });
      return row && toPermit(row);
    },
    async savePermit({ traineeId, status, expiresOn, updatedBy }) {
      const row = await one(
        `MERGE work_permits WITH (HOLDLOCK) AS t
         USING (SELECT @traineeId AS trainee_id) AS s ON t.trainee_id = s.trainee_id
         WHEN MATCHED THEN UPDATE SET status = @status, expires_on = @expiresOn,
           updated_by = @updatedBy, updated_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (trainee_id, status, expires_on, updated_by)
           VALUES (@traineeId, @status, @expiresOn, @updatedBy)
         OUTPUT INSERTED.*;`,
        { traineeId, status, expiresOn, updatedBy },
      );
      return toPermit(row);
    },

    async getProfile(traineeId) {
      const row = await one('SELECT * FROM trainee_profiles WHERE trainee_id = @traineeId', { traineeId });
      return row && toProfile(row);
    },
    async saveProfile({ traineeId, level, projectsPaused }) {
      const row = await one(
        `MERGE trainee_profiles WITH (HOLDLOCK) AS t
         USING (SELECT @traineeId AS trainee_id) AS s ON t.trainee_id = s.trainee_id
         WHEN MATCHED THEN UPDATE SET level = @level, projects_paused = @projectsPaused,
           updated_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (trainee_id, level, projects_paused)
           VALUES (@traineeId, @level, @projectsPaused)
         OUTPUT INSERTED.*;`,
        { traineeId, level, projectsPaused },
      );
      return toProfile(row);
    },

    async addNotification({ userId, kind, data, eventId }) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, kind, data, event_id)
           VALUES (@userId, @kind, @data, @eventId)`,
          { userId, kind, data: JSON.stringify(data ?? {}), eventId: eventId ?? null },
        );
      } catch (err) {
        // The same event delivered twice: the notification already exists.
        if (err.number !== DUPLICATE_KEY) throw err;
      }
    },
    async listNotifications(userId) {
      const rows = await db.query(
        `SELECT TOP 50 id, user_id, kind, data, created_at, read_at FROM notifications
         WHERE user_id = @userId ORDER BY created_at DESC, id DESC`,
        { userId },
      );
      return rows.map(toNotification);
    },
    async markNotificationRead(id, userId) {
      const rows = await db.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, SYSUTCDATETIME())
         OUTPUT INSERTED.id WHERE id = @id AND user_id = @userId`,
        { id, userId },
      );
      return rows.length > 0;
    },

    async enqueue(type, payload) {
      await db.query('INSERT INTO outbox (event_type, payload) VALUES (@type, @payload)', {
        type,
        payload: JSON.stringify(payload),
      });
    },
    async pendingEvents(limit, maxAttempts) {
      const rows = await db.query(
        `SELECT TOP (@limit) id, event_type, payload FROM outbox
         WHERE processed_at IS NULL AND attempts < @maxAttempts ORDER BY id`,
        { limit, maxAttempts },
      );
      return rows.map((r) => ({ id: Number(r.id), type: r.event_type, payload: JSON.parse(r.payload) }));
    },
    async markEventProcessed(id) {
      await db.query('UPDATE outbox SET processed_at = SYSUTCDATETIME() WHERE id = @id', { id });
    },
    async markEventFailed(id, error) {
      await db.query(
        'UPDATE outbox SET attempts = attempts + 1, last_error = LEFT(@error, 1000) WHERE id = @id',
        { id, error },
      );
    },
  };
}

// SQL Server adapter for the project store port. Every query is parameterised.
// transaction(fn) hands fn a store bound to the transaction.
const PROJECT_COLUMNS = `id, company_id, pack_code, title, goals, features, examples, deadline, status,
  level_required, setup_fee_jd, price_jd, preferred_trainee_id, trainee_id, revisions_used,
  max_revisions, rating, testimonial, testimonial_public, created_at, updated_at`;

// Column names for the fields updateProject may change.
const UPDATABLE = {
  status: 'status',
  levelRequired: 'level_required',
  setupFeeJd: 'setup_fee_jd',
  priceJd: 'price_jd',
  traineeId: 'trainee_id',
  revisionsUsed: 'revisions_used',
  rating: 'rating',
  testimonial: 'testimonial',
  testimonialPublic: 'testimonial_public',
};

const money = (v) => (v === null || v === undefined ? null : Number(v));
const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ?? null));

const toProject = (r) => ({
  id: r.id,
  companyId: r.company_id,
  packCode: r.pack_code,
  title: r.title,
  goals: r.goals,
  features: r.features,
  examples: r.examples,
  deadline: day(r.deadline),
  status: r.status,
  levelRequired: r.level_required,
  setupFeeJd: money(r.setup_fee_jd),
  priceJd: money(r.price_jd),
  preferredTraineeId: r.preferred_trainee_id,
  traineeId: r.trainee_id,
  revisionsUsed: r.revisions_used,
  maxRevisions: r.max_revisions,
  rating: r.rating,
  testimonial: r.testimonial,
  testimonialPublic: Boolean(r.testimonial_public),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toPack = (r) => ({
  code: r.code,
  name: r.name,
  summary: r.summary,
  deliveryDays: r.delivery_days,
  setupFeeJd: money(r.setup_fee_jd),
  priceJd: money(r.price_jd),
  levelRequired: r.level_required,
});

export function createSqlProjectStore(db) {
  const one = async (text, params) => (await db.query(text, params))[0] ?? null;
  const inserted = PROJECT_COLUMNS.replace(/(\w+)/g, 'INSERTED.$1');

  return {
    transaction: (fn) => db.transaction((tx) => fn(createSqlProjectStore(tx))),

    listPacks: async () =>
      (await db.query('SELECT * FROM packs ORDER BY level_required, price_jd')).map(toPack),
    async findPack(code) {
      const row = await one('SELECT * FROM packs WHERE code = @code', { code });
      return row && toPack(row);
    },

    async insertProject(p) {
      const row = await one(
        `INSERT INTO projects (company_id, pack_code, title, goals, features, examples, deadline, status,
           level_required, setup_fee_jd, price_jd, preferred_trainee_id)
         OUTPUT ${inserted}
         VALUES (@companyId, @packCode, @title, @goals, @features, @examples, @deadline, @status,
           @levelRequired, @setupFeeJd, @priceJd, @preferredTraineeId)`,
        p,
      );
      return toProject(row);
    },
    async findProject(id) {
      const row = await one(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = @id`, { id });
      return row && toProject(row);
    },
    async listProjects({ companyId, traineeId, status }) {
      const where = [];
      const params = {};
      for (const [column, name, value] of [
        ['company_id', 'companyId', companyId],
        ['trainee_id', 'traineeId', traineeId],
        ['status', 'status', status],
      ]) {
        if (value) {
          where.push(`${column} = @${name}`);
          params[name] = value;
        }
      }
      const rows = await db.query(
        `SELECT ${PROJECT_COLUMNS} FROM projects ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY updated_at DESC, id DESC`,
        params,
      );
      return rows.map(toProject);
    },
    async updateProject(id, changes) {
      // Only known fields become columns; values are always parameters.
      const fields = Object.keys(changes).filter((k) => UPDATABLE[k]);
      const sets = fields.map((k) => `${UPDATABLE[k]} = @${k}`);
      const row = await one(
        `UPDATE projects SET ${[...sets, 'updated_at = SYSUTCDATETIME()'].join(', ')}
         OUTPUT ${inserted} WHERE id = @id`,
        { ...Object.fromEntries(fields.map((k) => [k, changes[k]])), id },
      );
      return toProject(row);
    },

    async addEvent(e) {
      await db.query(
        `INSERT INTO project_events (project_id, action, from_status, to_status, actor_id, note)
         VALUES (@projectId, @action, @from, @to, @actorId, @note)`,
        { ...e, note: e.note ?? null },
      );
    },
    async listEvents(projectId) {
      const rows = await db.query('SELECT * FROM project_events WHERE project_id = @projectId ORDER BY id', {
        projectId,
      });
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        from: r.from_status,
        to: r.to_status,
        actorId: r.actor_id,
        note: r.note,
        createdAt: r.created_at,
      }));
    },

    async addMessage(m) {
      const row = await one(
        `INSERT INTO messages (project_id, author_id, body) OUTPUT INSERTED.*
         VALUES (@projectId, @authorId, @body)`,
        m,
      );
      return { id: row.id, authorId: row.author_id, body: row.body, createdAt: row.created_at };
    },
    async listMessages(projectId) {
      const rows = await db.query('SELECT * FROM messages WHERE project_id = @projectId ORDER BY id', {
        projectId,
      });
      return rows.map((r) => ({ id: r.id, authorId: r.author_id, body: r.body, createdAt: r.created_at }));
    },

    async addInvoice(i) {
      await db.query(
        `INSERT INTO invoices (project_id, kind, amount_jd, payment_ref)
         VALUES (@projectId, @kind, @amountJd, @paymentRef)`,
        i,
      );
    },
    async listInvoices({ projectId, companyId }) {
      const where = [];
      const params = {};
      if (projectId) {
        where.push('i.project_id = @projectId');
        params.projectId = projectId;
      }
      if (companyId) {
        where.push('p.company_id = @companyId');
        params.companyId = companyId;
      }
      const rows = await db.query(
        `SELECT i.*, p.title FROM invoices i JOIN projects p ON p.id = i.project_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.paid_at DESC, i.id DESC`,
        params,
      );
      return rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        projectTitle: r.title,
        kind: r.kind,
        amountJd: money(r.amount_jd),
        paymentRef: r.payment_ref,
        paidAt: r.paid_at,
      }));
    },

    async addPayout(p) {
      await db.query(
        `INSERT INTO payouts (project_id, trainee_id, amount_jd, jiwar_share_jd)
         VALUES (@projectId, @traineeId, @amountJd, @jiwarShareJd)`,
        p,
      );
    },
    async findPayout(projectId) {
      const row = await one('SELECT * FROM payouts WHERE project_id = @projectId', { projectId });
      return (
        row && {
          amountJd: money(row.amount_jd),
          jiwarShareJd: money(row.jiwar_share_jd),
          createdAt: row.created_at,
        }
      );
    },
    async listPayouts({ traineeId }) {
      const rows = await db.query(
        `SELECT o.*, p.title FROM payouts o JOIN projects p ON p.id = o.project_id
         ${traineeId ? 'WHERE o.trainee_id = @traineeId' : ''} ORDER BY o.created_at DESC, o.id DESC`,
        traineeId ? { traineeId } : {},
      );
      return rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        projectTitle: r.title,
        traineeId: r.trainee_id,
        amountJd: money(r.amount_jd),
        jiwarShareJd: money(r.jiwar_share_jd),
        createdAt: r.created_at,
      }));
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

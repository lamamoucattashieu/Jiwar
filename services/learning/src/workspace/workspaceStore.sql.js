// SQL Server adapter for the workspace store port. Every query is parameterised.
// transaction(fn) hands fn a store bound to the transaction, which runs one
// query at a time, so nothing here uses Promise.all.
const toRepo = (r) => ({ id: r.id, courseId: r.course_id, traineeId: r.trainee_id, createdAt: r.created_at });
const toCommit = (c) => ({
  id: c.id,
  parentId: c.parent_id,
  message: c.message,
  authorId: c.author_id,
  createdAt: c.created_at,
});
const toBranch = (b) => ({ id: b.id, repoId: b.repo_id, name: b.name, headCommitId: b.head_commit_id });
const toPull = (p) => ({
  id: p.id,
  repoId: p.repo_id,
  sourceBranch: p.source_branch,
  targetBranch: p.target_branch,
  title: p.title,
  description: p.description,
  status: p.status,
  createdBy: p.created_by,
  reviewedBy: p.reviewed_by,
  mergedCommitId: p.merged_commit_id,
  baseCommitId: p.base_commit_id,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});
const toComment = (c) => ({
  id: c.id,
  pullId: c.pull_id,
  path: c.path,
  line: c.line,
  body: c.body,
  authorId: c.author_id,
  createdAt: c.created_at,
});

// Column names for the fields updatePull may change.
const PULL_COLUMNS = {
  status: 'status',
  reviewedBy: 'reviewed_by',
  mergedCommitId: 'merged_commit_id',
  baseCommitId: 'base_commit_id',
};

export function createSqlWorkspaceStore(db) {
  const one = async (text, params) => (await db.query(text, params))[0] ?? null;

  return {
    transaction: (fn) => db.transaction((tx) => fn(createSqlWorkspaceStore(tx))),

    async findRepo(id) {
      const row = await one('SELECT * FROM code_repos WHERE id = @id', { id });
      return row && toRepo(row);
    },
    async findRepoFor(courseId, traineeId) {
      const row = await one(
        'SELECT * FROM code_repos WHERE course_id = @courseId AND trainee_id = @traineeId',
        {
          courseId,
          traineeId,
        },
      );
      return row && toRepo(row);
    },
    async insertRepo({ courseId, traineeId }) {
      return toRepo(
        await one(
          'INSERT INTO code_repos (course_id, trainee_id) OUTPUT INSERTED.* VALUES (@courseId, @traineeId)',
          { courseId, traineeId },
        ),
      );
    },
    async listRepos({ traineeId, courseIds }) {
      if (courseIds && courseIds.length === 0) return [];
      const where = [];
      const params = {};
      if (traineeId) {
        where.push('trainee_id = @traineeId');
        params.traineeId = traineeId;
      }
      if (courseIds) {
        // One parameter per id: never string-built values.
        where.push(`course_id IN (${courseIds.map((_, i) => `@c${i}`).join(', ')})`);
        courseIds.forEach((id, i) => {
          params[`c${i}`] = id;
        });
      }
      const rows = await db.query(
        `SELECT * FROM code_repos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC`,
        params,
      );
      return rows.map(toRepo);
    },

    async insertCommit({ repoId, parentId, message, authorId, files }) {
      const commit = await one(
        `INSERT INTO code_commits (repo_id, parent_id, message, author_id) OUTPUT INSERTED.*
         VALUES (@repoId, @parentId, @message, @authorId)`,
        { repoId, parentId, message, authorId },
      );
      for (const f of files) {
        await db.query(
          'INSERT INTO code_files (commit_id, path, content) VALUES (@commitId, @path, @content)',
          {
            commitId: commit.id,
            path: f.path,
            content: f.content,
          },
        );
      }
      return toCommit(commit);
    },
    async listFiles(commitId) {
      return db.query('SELECT path, content FROM code_files WHERE commit_id = @commitId ORDER BY path', {
        commitId,
      });
    },
    async listCommits(headId) {
      // Walk the parent links from the head commit, newest first.
      const rows = await db.query(
        `WITH history AS (
           SELECT id, parent_id, message, author_id, created_at, 0 AS depth FROM code_commits WHERE id = @headId
           UNION ALL
           SELECT c.id, c.parent_id, c.message, c.author_id, c.created_at, h.depth + 1
           FROM code_commits c JOIN history h ON c.id = h.parent_id
         )
         SELECT * FROM history ORDER BY depth OPTION (MAXRECURSION 1000)`,
        { headId },
      );
      return rows.map(toCommit);
    },

    async findBranch(repoId, name) {
      const row = await one('SELECT * FROM code_branches WHERE repo_id = @repoId AND name = @name', {
        repoId,
        name,
      });
      return row && toBranch(row);
    },
    async listBranches(repoId) {
      return (
        await db.query('SELECT * FROM code_branches WHERE repo_id = @repoId ORDER BY name', { repoId })
      ).map(toBranch);
    },
    async insertBranch({ repoId, name, headCommitId }) {
      return toBranch(
        await one(
          `INSERT INTO code_branches (repo_id, name, head_commit_id) OUTPUT INSERTED.*
           VALUES (@repoId, @name, @headCommitId)`,
          { repoId, name, headCommitId },
        ),
      );
    },
    async moveBranch(branchId, commitId) {
      await db.query('UPDATE code_branches SET head_commit_id = @commitId WHERE id = @branchId', {
        branchId,
        commitId,
      });
    },

    async insertPull(p) {
      return toPull(
        await one(
          `INSERT INTO pull_requests (repo_id, source_branch, target_branch, title, description, status, created_by)
           OUTPUT INSERTED.*
           VALUES (@repoId, @sourceBranch, @targetBranch, @title, @description, 'open', @createdBy)`,
          p,
        ),
      );
    },
    async findPull(id) {
      const row = await one('SELECT * FROM pull_requests WHERE id = @id', { id });
      return row && toPull(row);
    },
    async listPulls({ repoId, repoIds, status }) {
      if (repoIds && repoIds.length === 0) return [];
      const where = [];
      const params = {};
      if (repoId) {
        where.push('repo_id = @repoId');
        params.repoId = repoId;
      }
      if (repoIds) {
        where.push(`repo_id IN (${repoIds.map((_, i) => `@r${i}`).join(', ')})`);
        repoIds.forEach((id, i) => {
          params[`r${i}`] = id;
        });
      }
      if (status) {
        where.push('status = @status');
        params.status = status;
      }
      const rows = await db.query(
        `SELECT * FROM pull_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY updated_at DESC, id DESC`,
        params,
      );
      return rows.map(toPull);
    },
    async hasOpenPull(repoId, source) {
      const row = await one(
        `SELECT TOP 1 1 AS found FROM pull_requests
         WHERE repo_id = @repoId AND source_branch = @source AND status IN ('open', 'changes_requested')`,
        { repoId, source },
      );
      return Boolean(row);
    },
    async updatePull(id, changes) {
      const fields = Object.keys(changes).filter((k) => PULL_COLUMNS[k]);
      const sets = fields.map((k) => `${PULL_COLUMNS[k]} = @${k}`);
      return toPull(
        await one(
          `UPDATE pull_requests SET ${[...sets, 'updated_at = SYSUTCDATETIME()'].join(', ')}
           OUTPUT INSERTED.* WHERE id = @id`,
          { ...Object.fromEntries(fields.map((k) => [k, changes[k]])), id },
        ),
      );
    },
    async reopenPulls(repoId, source) {
      await db.query(
        `UPDATE pull_requests SET status = 'open', updated_at = SYSUTCDATETIME()
         WHERE repo_id = @repoId AND source_branch = @source AND status = 'changes_requested'`,
        { repoId, source },
      );
    },

    async insertComment(c) {
      return toComment(
        await one(
          `INSERT INTO review_comments (pull_id, path, line, body, author_id) OUTPUT INSERTED.*
           VALUES (@pullId, @path, @line, @body, @authorId)`,
          c,
        ),
      );
    },
    async listComments(pullId) {
      return (
        await db.query('SELECT * FROM review_comments WHERE pull_id = @pullId ORDER BY id', { pullId })
      ).map(toComment);
    },
  };
}

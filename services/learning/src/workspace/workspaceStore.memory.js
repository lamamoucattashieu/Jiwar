// In-memory adapter for the workspace store port: tests, and running without
// DATABASE_URL. transaction() rolls back on error, like SQL Server.
const now = () => new Date().toISOString();
const copy = (x) => structuredClone(x);
const OPEN = ['open', 'changes_requested'];

export function createMemoryWorkspaceStore() {
  let state = {
    seq: { repo: 1, commit: 1, branch: 1, pull: 1, comment: 1 },
    repos: [],
    commits: [],
    branches: [],
    pulls: [],
    comments: [],
  };
  const add = (table, seq, row) => {
    const full = { ...row, id: state.seq[seq]++, createdAt: now() };
    state[table].push(full);
    return full;
  };

  const store = {
    async transaction(fn) {
      const before = copy(state);
      try {
        return await fn(store);
      } catch (err) {
        state = before;
        throw err;
      }
    },

    findRepo: async (id) => copy(state.repos.find((r) => r.id === id) ?? null),
    findRepoFor: async (courseId, traineeId) =>
      copy(state.repos.find((r) => r.courseId === courseId && r.traineeId === traineeId) ?? null),
    insertRepo: async (r) => copy(add('repos', 'repo', r)),
    listRepos: async ({ traineeId, courseIds }) =>
      copy(
        state.repos.filter(
          (r) => (!traineeId || r.traineeId === traineeId) && (!courseIds || courseIds.includes(r.courseId)),
        ),
      ),

    async insertCommit({ files, ...c }) {
      const commit = add('commits', 'commit', {
        ...c,
        files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
      });
      const { files: _files, ...meta } = commit; // eslint-disable-line no-unused-vars
      return copy(meta);
    },
    listFiles: async (commitId) => copy(state.commits.find((c) => c.id === commitId).files),
    async listCommits(headId) {
      const history = [];
      for (
        let c = state.commits.find((x) => x.id === headId);
        c;
        c = state.commits.find((x) => x.id === c.parentId)
      ) {
        const { files, ...meta } = c; // eslint-disable-line no-unused-vars
        history.push(meta);
      }
      return copy(history);
    },

    findBranch: async (repoId, name) =>
      copy(state.branches.find((b) => b.repoId === repoId && b.name === name) ?? null),
    listBranches: async (repoId) => copy(state.branches.filter((b) => b.repoId === repoId)),
    insertBranch: async (b) => copy(add('branches', 'branch', b)),
    async moveBranch(branchId, commitId) {
      state.branches.find((b) => b.id === branchId).headCommitId = commitId;
    },

    insertPull: async (p) =>
      copy(
        add('pulls', 'pull', {
          ...p,
          status: 'open',
          reviewedBy: null,
          mergedCommitId: null,
          baseCommitId: null,
          updatedAt: now(),
        }),
      ),
    findPull: async (id) => copy(state.pulls.find((p) => p.id === id) ?? null),
    listPulls: async ({ repoId, repoIds, status }) =>
      copy(
        state.pulls
          .filter((p) => (!repoId || p.repoId === repoId) && (!repoIds || repoIds.includes(p.repoId)))
          .filter((p) => !status || p.status === status)
          .reverse(),
      ),
    hasOpenPull: async (repoId, source) =>
      state.pulls.some((p) => p.repoId === repoId && p.sourceBranch === source && OPEN.includes(p.status)),
    async updatePull(id, changes) {
      const p = state.pulls.find((x) => x.id === id);
      Object.assign(p, changes, { updatedAt: now() });
      return copy(p);
    },
    async reopenPulls(repoId, source) {
      for (const p of state.pulls) {
        if (p.repoId === repoId && p.sourceBranch === source && p.status === 'changes_requested')
          p.status = 'open';
      }
    },

    insertComment: async (c) => copy(add('comments', 'comment', c)),
    listComments: async (pullId) => copy(state.comments.filter((c) => c.pullId === pullId)),
  };
  return store;
}

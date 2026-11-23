// Checks the SQL adapter's queries and row mapping with a fake executor.
// The real SQL Server runs them through docker compose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqlWorkspaceStore } from '../src/workspace/workspaceStore.sql.js';

function fakeDb(respond = () => []) {
  const calls = [];
  const db = {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return respond(text, params);
    },
    transaction: async (fn) => fn(db),
  };
  return db;
}

const pullRow = {
  id: 4,
  repo_id: 1,
  source_branch: 'feature',
  target_branch: 'main',
  title: 'T',
  description: '',
  status: 'open',
  created_by: 't',
  reviewed_by: null,
  merged_commit_id: null,
  base_commit_id: null,
  created_at: 'c',
  updated_at: 'u',
};

test('repos: lookups, and course ids become one parameter each', async () => {
  const db = fakeDb(() => [{ id: 1, course_id: 2, trainee_id: 't', created_at: 'c' }]);
  const store = createSqlWorkspaceStore(db);
  assert.equal((await store.findRepo(1)).courseId, 2);
  assert.equal((await store.findRepoFor(2, 't')).traineeId, 't');
  assert.equal((await store.insertRepo({ courseId: 2, traineeId: 't' })).id, 1);
  await store.listRepos({ courseIds: [2, 5] });
  assert.match(db.calls.at(-1).text, /course_id IN \(@c0, @c1\)/);
  assert.deepEqual(db.calls.at(-1).params, { c0: 2, c1: 5 });
  await store.listRepos({ traineeId: 't' });
  assert.match(db.calls.at(-1).text, /trainee_id = @traineeId/);
  assert.deepEqual(await store.listRepos({ courseIds: [] }), []);
  assert.equal(await createSqlWorkspaceStore(fakeDb()).findRepo(9), null);
  assert.equal(await createSqlWorkspaceStore(fakeDb()).findRepoFor(1, 'x'), null);
});

test('a commit inserts its files one by one; history walks parent links', async () => {
  const db = fakeDb((text) =>
    text.includes('code_commits')
      ? [{ id: 7, parent_id: 6, message: 'm', author_id: 'a', created_at: 'c' }]
      : [],
  );
  const store = createSqlWorkspaceStore(db);
  const commit = await store.insertCommit({
    repoId: 1,
    parentId: 6,
    message: 'm',
    authorId: 'a',
    files: [
      { path: 'a.html', content: 'x' },
      { path: 'b.css', content: 'y' },
    ],
  });
  assert.deepEqual([commit.id, commit.parentId], [7, 6]);
  assert.equal(db.calls.filter((c) => c.text.startsWith('INSERT INTO code_files')).length, 2);
  await store.listCommits(7);
  assert.match(db.calls.at(-1).text, /WITH history AS/);
  await store.listFiles(7);
  assert.deepEqual(db.calls.at(-1).params, { commitId: 7 });
});

test('branches and pull requests', async () => {
  const db = fakeDb((text) => {
    if (text.includes('code_branches')) return [{ id: 3, repo_id: 1, name: 'main', head_commit_id: 7 }];
    if (text.includes('pull_requests')) return [pullRow];
    return [];
  });
  const store = createSqlWorkspaceStore(db);
  assert.equal((await store.findBranch(1, 'main')).headCommitId, 7);
  assert.equal((await store.listBranches(1))[0].name, 'main');
  assert.equal((await store.insertBranch({ repoId: 1, name: 'main', headCommitId: 7 })).id, 3);
  await store.moveBranch(3, 8);
  assert.deepEqual(db.calls.at(-1).params, { branchId: 3, commitId: 8 });

  assert.equal((await store.insertPull({})).sourceBranch, 'feature');
  assert.equal((await store.findPull(4)).targetBranch, 'main');
  await store.listPulls({ repoIds: [1, 2], status: 'open' });
  assert.match(db.calls.at(-1).text, /repo_id IN \(@r0, @r1\) AND status = @status/);
  await store.listPulls({ repoId: 1 });
  assert.deepEqual(await store.listPulls({ repoIds: [] }), []);
  assert.equal(await store.hasOpenPull(1, 'feature'), true);

  await store.updatePull(4, { status: 'merged', mergedCommitId: 8, bogus: 'x' });
  assert.match(db.calls.at(-1).text, /SET status = @status, merged_commit_id = @mergedCommitId, updated_at/);
  assert.doesNotMatch(db.calls.at(-1).text, /bogus/);
  await store.reopenPulls(1, 'feature');
  assert.match(db.calls.at(-1).text, /status = 'changes_requested'/);
  assert.equal(await createSqlWorkspaceStore(fakeDb()).findBranch(1, 'x'), null);
  assert.equal(await createSqlWorkspaceStore(fakeDb()).findPull(1), null);
  assert.equal(await store.transaction(async () => 'ok'), 'ok');
});

test('review comments', async () => {
  const row = { id: 1, pull_id: 4, path: 'a.html', line: 2, body: 'b', author_id: 'i', created_at: 'c' };
  const store = createSqlWorkspaceStore(fakeDb(() => [row]));
  assert.equal((await store.insertComment({})).line, 2);
  assert.equal((await store.listComments(4))[0].authorId, 'i');
});

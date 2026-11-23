// The coding workspace (stories #19, #20): repositories, commits, branches and
// pull requests, stored by a port (SQL Server or in memory). Rules:
//   - a trainee writes only in their own repository; instructors of the course
//     and admins read and review it; nobody else even sees it
//   - main is protected: work happens on branches and reaches main through a
//     pull request an instructor approves (the same flow the team uses)
//   - approving can record the grade, which goes to the admin verification queue
import { HttpError, conflict, forbidden, notFound } from '../http/errors.js';
import { hasRole } from '../http/auth.js';
import { parse } from '../http/validate.js';
import { diffSnapshots, sameSnapshot } from './codeDiff.js';
import {
  MAIN,
  approveInput,
  branchInput,
  branchQuery,
  changesInput,
  commentInput,
  commitInput,
  idParam,
  pullInput,
} from './workspaceSchema.js';

const starterFiles = (course) => [
  {
    path: 'README.md',
    content: `# ${course.title}\n\nWrite your solution here. Work on a branch, commit, then open a pull request for review.\n`,
  },
  {
    path: 'index.html',
    content:
      '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>My page</title>\n  </head>\n  <body>\n    <h1>Hello, Jiwar</h1>\n  </body>\n</html>\n',
  },
];

export function createWorkspaceService({ store, courses, credits }) {
  const isReviewer = (user, course) =>
    hasRole(user, 'admin') || (hasRole(user, 'instructor') && course.instructorId === user.id);

  /** The repository and its course, if this user may see it; otherwise 404. */
  async function loadRepo(user, rawId) {
    const repo = await store.findRepo(parse(idParam, rawId));
    if (!repo) throw notFound('Repository not found');
    const course = await courses.findById(repo.courseId);
    if (repo.traineeId !== user.id && !isReviewer(user, course)) throw notFound('Repository not found');
    return { repo, course };
  }

  function requireOwner(user, repo) {
    if (repo.traineeId !== user.id)
      throw forbidden('Only the trainee who owns this repository can change it');
  }

  async function branchOrFail(tx, repoId, name) {
    const branch = await tx.findBranch(repoId, name);
    if (!branch) throw notFound(`Branch "${name}" not found`);
    return branch;
  }

  // Is `ancestorId` in the history of `commitId`? (Used for fast-forward merges.)
  async function isAncestor(tx, ancestorId, commitId) {
    const history = await tx.listCommits(commitId);
    return history.some((c) => c.id === ancestorId);
  }

  async function loadPull(user, rawId) {
    const pull = await store.findPull(parse(idParam, rawId));
    if (!pull) throw notFound('Pull request not found');
    const { repo, course } = await loadRepo(user, pull.repoId);
    return { pull, repo, course };
  }

  function requireReviewer(user, course) {
    if (!isReviewer(user, course)) throw forbidden("Only the course's instructor or an admin can review");
  }

  return {
    /** A trainee opens (or creates) their repository for a course. */
    async openWorkspace(user, rawCourseId) {
      const course = await courses.findById(parse(idParam, rawCourseId));
      if (!course || !course.published) throw notFound('Course not found');
      if (!hasRole(user, 'trainee')) throw forbidden('Workspaces are for trainees');
      const existing = await store.findRepoFor(course.id, user.id);
      if (existing) return existing;
      return store.transaction(async (tx) => {
        const repo = await tx.insertRepo({ courseId: course.id, traineeId: user.id });
        const commit = await tx.insertCommit({
          repoId: repo.id,
          parentId: null,
          message: 'Start from the course template',
          authorId: user.id,
          files: starterFiles(course),
        });
        await tx.insertBranch({ repoId: repo.id, name: MAIN, headCommitId: commit.id });
        return repo;
      });
    },

    /** Trainees see their repositories; instructors those of their courses; admins all. */
    async listRepos(user) {
      if (hasRole(user, 'admin')) return store.listRepos({});
      if (hasRole(user, 'instructor')) {
        const mine = await courses.list({ instructorId: user.id, limit: 100, offset: 0 });
        return store.listRepos({ courseIds: mine.map((c) => c.id) });
      }
      return store.listRepos({ traineeId: user.id });
    },

    async repo(user, rawId) {
      const { repo, course } = await loadRepo(user, rawId);
      const [branches, pulls] = await Promise.all([
        store.listBranches(repo.id),
        store.listPulls({ repoId: repo.id }),
      ]);
      return { ...repo, courseTitle: course.title, branches, pulls, canWrite: repo.traineeId === user.id };
    },

    async files(user, rawId, query) {
      const { repo } = await loadRepo(user, rawId);
      const { branch } = parse(branchQuery, query);
      const head = await branchOrFail(store, repo.id, branch);
      return store.listFiles(head.headCommitId);
    },

    async history(user, rawId, query) {
      const { repo } = await loadRepo(user, rawId);
      const { branch } = parse(branchQuery, query);
      const head = await branchOrFail(store, repo.id, branch);
      return store.listCommits(head.headCommitId);
    },

    async createBranch(user, rawId, body) {
      const { repo } = await loadRepo(user, rawId);
      requireOwner(user, repo);
      const { name, from } = parse(branchInput, body);
      return store.transaction(async (tx) => {
        if (await tx.findBranch(repo.id, name)) throw conflict(`Branch "${name}" already exists`);
        const base = await branchOrFail(tx, repo.id, from);
        return tx.insertBranch({ repoId: repo.id, name, headCommitId: base.headCommitId });
      });
    },

    /** Saves the full set of files as a new commit on a branch (never on main). */
    async commit(user, rawId, body) {
      const { repo } = await loadRepo(user, rawId);
      requireOwner(user, repo);
      const { branch: name, message, files } = parse(commitInput, body);
      if (name === MAIN)
        throw forbidden('main is protected: create a branch, commit there and open a pull request');
      return store.transaction(async (tx) => {
        const branch = await branchOrFail(tx, repo.id, name);
        if (sameSnapshot(await tx.listFiles(branch.headCommitId), files))
          throw conflict('Nothing changed since the last commit');
        const commit = await tx.insertCommit({
          repoId: repo.id,
          parentId: branch.headCommitId,
          message,
          authorId: user.id,
          files,
        });
        await tx.moveBranch(branch.id, commit.id);
        // New work after "changes requested" puts the pull request back in the review queue.
        await tx.reopenPulls(repo.id, name);
        return commit;
      });
    },

    async openPull(user, rawId, body) {
      const { repo } = await loadRepo(user, rawId);
      requireOwner(user, repo);
      const { source, title, description } = parse(pullInput, body);
      if (source === MAIN) throw conflict('Open a pull request from a branch into main');
      return store.transaction(async (tx) => {
        const [from, into] = [await branchOrFail(tx, repo.id, source), await branchOrFail(tx, repo.id, MAIN)];
        if (from.headCommitId === into.headCommitId)
          throw conflict('This branch has no changes compared with main');
        if (await tx.hasOpenPull(repo.id, source))
          throw conflict('This branch already has an open pull request');
        return tx.insertPull({
          repoId: repo.id,
          sourceBranch: source,
          targetBranch: MAIN,
          title,
          description,
          createdBy: user.id,
        });
      });
    },

    /** Instructors: open pull requests waiting for review in their courses (admins: all). */
    async reviewQueue(user) {
      const repos = await this.listRepos(user);
      if (repos.length === 0) return [];
      const pulls = await store.listPulls({ repoIds: repos.map((r) => r.id), status: 'open' });
      return pulls.map((p) => ({ ...p, traineeId: repos.find((r) => r.id === p.repoId).traineeId }));
    },

    /** A pull request with its diff against main and its review comments. */
    async pull(user, rawId) {
      const { pull, repo, course } = await loadPull(user, rawId);
      const [source, target, comments] = await Promise.all([
        store.findBranch(repo.id, pull.sourceBranch),
        store.findBranch(repo.id, pull.targetBranch),
        store.listComments(pull.id),
      ]);
      // A merged pull request keeps showing the changes it brought in.
      const newHead = pull.mergedCommitId ?? source.headCommitId;
      const base = pull.status === 'merged' ? pull.baseCommitId : target.headCommitId;
      const [before, after] = await Promise.all([store.listFiles(base), store.listFiles(newHead)]);
      return {
        ...pull,
        traineeId: repo.traineeId,
        courseId: course.id,
        courseTitle: course.title,
        canReview: isReviewer(user, course) && pull.status !== 'merged',
        diff: diffSnapshots(before, after),
        comments,
      };
    },

    async comment(user, rawId, body) {
      const { pull } = await loadPull(user, rawId);
      return store.insertComment({ pullId: pull.id, ...parse(commentInput, body), authorId: user.id });
    },

    async requestChanges(user, rawId, body) {
      const { pull, course } = await loadPull(user, rawId);
      requireReviewer(user, course);
      const { body: text } = parse(changesInput, body);
      if (pull.status !== 'open') throw conflict('Only an open pull request can be sent back');
      return store.transaction(async (tx) => {
        await tx.insertComment({ pullId: pull.id, path: null, line: null, body: text, authorId: user.id });
        return tx.updatePull(pull.id, { status: 'changes_requested', reviewedBy: user.id });
      });
    },

    /**
     * Approve = merge into main (fast-forward) and, if a grade is given, record
     * the result for the admin verification queue (story #12).
     */
    async approve(user, rawId, body) {
      const { pull, repo, course } = await loadPull(user, rawId);
      requireReviewer(user, course);
      const { grade } = parse(approveInput, body);
      if (pull.status !== 'open') throw conflict('Only an open pull request can be approved');

      const source = await branchOrFail(store, repo.id, pull.sourceBranch);
      const target = await branchOrFail(store, repo.id, pull.targetBranch);
      if (!(await isAncestor(store, target.headCommitId, source.headCommitId))) {
        throw new HttpError(
          409,
          'main has changed since this branch was created; the trainee must start a new branch from main',
        );
      }

      // The grade first: if it is refused (for example, already graded), nothing is merged.
      const result =
        grade === null
          ? null
          : await credits.recordResult(user, { courseId: course.id, traineeId: repo.traineeId, grade });

      const merged = await store.transaction(async (tx) => {
        await tx.moveBranch(target.id, source.headCommitId);
        return tx.updatePull(pull.id, {
          status: 'merged',
          reviewedBy: user.id,
          mergedCommitId: source.headCommitId,
          baseCommitId: target.headCommitId,
        });
      });
      return { ...merged, result };
    },
  };
}

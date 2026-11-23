# Prompt: in-app coding workspace (in-house Git, Monaco, pull request review)

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: let trainees write code in Jiwar and instructors review it like a real team (stories #19, #20)

Build on the learning service and the Jiwar-branded UI as they are. The approved proposal described a self-hosted Git server, but the brief allows exactly two services and no other storage, and a Git server would lose its repositories whenever Container Apps scales to zero. So build our own small Git inside the learning service, stored in Azure SQL (ADR-1 explains the trade).

## Scope
1. **Migration `006`**: repositories (one per trainee per course), commits (with a parent), the files of each commit as a full snapshot, branches pointing at commits, pull requests (open, changes requested, merged; one open per branch), review comments (on a line of the new code, or on the whole pull request).
2. **Diff**: a pure line diff based on the longest common subsequence (removed lines before added ones, with old and new line numbers), and a snapshot diff (added, removed, modified files). Very long files are shown as replaced.
3. **Rules** (`workspaceService.js`):
   - A trainee opens their workspace from a published course; it starts with a template commit on `main`.
   - Only the owner changes the repository; the course's instructor and admins read and review it; anyone else gets 404.
   - `main` is protected: commits go to branches; a pull request brings a branch into `main`.
   - Empty commits, pull requests without changes, from `main`, or a second one for the same branch are refused.
   - Request changes needs a note; a new commit on the branch puts the pull request back in the review queue.
   - Approve merges by fast-forward and refuses when `main` moved since the branch was made. With a grade, it records the course result through the credit service (so it reaches the admin verification queue); if the grade is refused, nothing is merged.
   - Paths and sizes are validated (no `..`, at most 30 files of 50,000 characters).
4. **Adapters**: SQL Server (recursive query for history, one parameter per id in `IN` lists) and in-memory with rollback.
5. **UI**: the Monaco editor (bundled, loaded only on the workspace page), file tree with new and delete file, branch picker, commit bar, history, pull request list; the pull request page with the diff, comments on lines, the conversation, and request changes or approve with an optional grade; an instructor review queue; an "Open my coding workspace" button on the course page. English and Arabic.
6. **Tests and docs**: the diff, the whole flow through the API, the SQL adapter with a fake executor; the data model.

## Process
Verify on SQL Server through `docker compose` (migration on an existing database, protected main, history, Arabic text round-tripping, approve with and without a grade, the grade reaching the verification queue), then in the browser as a trainee (Monaco) and as an instructor (line comment, request changes). Run lint, the build and the smoke test.

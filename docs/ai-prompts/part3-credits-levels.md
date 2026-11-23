# Prompt: credits, verification, levels, permits and notifications

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: turn graded work into credits and levels (stories #12, #13, #14)

Build on the learning service as it is (ports and adapters per feature, zod validation, migrations on startup, demo users with `requireRole`, ADR-1 to ADR-5) and on the Jiwar-branded UI. Keep both services' architecture: no new service, container or database.

## Rules from the approved proposal
- Credits are earned from passed modules, attendance and completed projects. A credit only counts once an instructor has graded it **and** an admin has verified it. Nobody verifies their own grading.
- The credit ledger is append-only: corrections are new entries with a reason, never edits. Enforce this in the database itself, not only in code.
- Levels: 1 Junior (30 credits, Web basics passed, verified work permit), 2 Builder (70 credits, React passed, 1 project), 3 Lead (120 credits, Practical AI passed, 3 projects). Levels are reached in order, are recalculated automatically when credits or permits change, and never drop on their own. An admin can pause project access without touching credits or level.
- The trainee dashboard shows progress such as "15 of 30 credits towards Level 1" and what is still missing.
- Work permits: an admin records status and expiry; permits expiring within 30 days are flagged. Instructors and businesses never see permit data.
- Notifications in the app when credits change, a result is rejected, or a level is reached.

## Scope
1. **Migrations** `003` (course `required_for_level`, `course_results`, `credit_ledger` with an append-only trigger, `work_permits`, `trainee_profiles`, `notifications`, `outbox`) and `004` (demo data showing every state).
2. **Level rules** as pure functions (`levelRules.js`) with no database or HTTP.
3. **Credit service** with a store port and two adapters (SQL Server, in-memory with real rollback): record a final grade (instructor of the course or admin; passing grades go to verification, failing ones do not), verification queue, verify, reject with a reason, corrections, progress (permit data hidden from instructors), permit overview and updates, pausing projects, notifications.
4. **Transactional outbox**: every change that others react to writes an event in the same transaction; a dispatcher delivers events to handlers (credits changed → notify and recalculate level → level reached → notify), retries failures on a later run, gives up after 5 attempts, and never notifies twice for the same event. Deliver right after each change, on startup and every minute while the container runs.
5. **Routes**: thin, with roles checked on the server.
6. **UI** (English and Arabic, Jiwar brand): grade form on the course page, admin verification queue, admin trainees-and-permits page, trainee progress page with a progress bar and the locked-projects key, notifications page.
7. **Tests**: level rules, the whole flow through the API, outbox retry and idempotency, rollback, and the SQL adapter against a fake executor. Keep 70%+ coverage.
8. **Docs**: data model with the new tables, and the outbox decision inside the existing records (the brief allows at most 6).

## Process
Verify against real SQL Server through `docker compose` (migrations on an existing database, the trigger refusing UPDATE and DELETE, the outbox delivered), click through the UI as instructor, admin and trainee, and run the smoke test.

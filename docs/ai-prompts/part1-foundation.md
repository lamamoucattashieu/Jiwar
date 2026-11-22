# Prompt: foundation layer and Courses CRUD

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: build the foundation layer across both services and the React UI

You are working in an existing monorepo with two Express services (`services/learning`, `services/projects`) and a React (Vite) UI. Before writing code, read the repo structure, ADR-1 to ADR-4, the package.json files, Dockerfiles and `docker-compose.yml`, and match what is already there: plain JavaScript (ES modules) on Node 24, Express 5, Node's built-in test runner with Supertest, and SQL Server (Azure SQL serverless on Azure). Do not add a library when an existing one covers the need, and do not upgrade existing dependencies. If something in this brief conflicts with the repo, stop and tell me instead of silently picking one.

## Scope

### 1. Migration runner (checksums and lock)
- Plain SQL files in each service's `migrations/` folder, named `NNN_description.sql`, applied in order on startup, each in its own transaction.
- Support `GO` batch separators, since SQL Server tools use them and the driver does not.
- Record applied migrations in `schema_migrations` with a SHA-256 checksum. Normalise line endings first, so a Windows checkout gives the same checksum. If an applied file changed, stop startup with a clear message naming the file. Never auto-fix.
- Use SQL Server's `sp_getapplock` inside each migration's transaction so two instances starting together (for example two revisions during a canary deploy) cannot apply the same migration; re-check after taking the lock.
- Running twice is a no-op. Reject badly named files and duplicate versions.
- Keep the runner independent of the driver (it receives a small `query` / `transaction` executor) so it is tested with a fake database.

### 2. Database connection with retry and URL parsing
- One module that talks to the `mssql` driver; everything else receives an executor (`query`, `transaction`, `ping`, `close`).
- `DATABASE_URL` may be an `mssql://user:pass@host:port/db?encrypt=...&trustServerCertificate=...` URL (docker compose) or an ADO.NET connection string (Azure). Parse URLs into the driver's config in one tested function, decoding special characters; pass ADO strings through. Default to encryption on and certificate checks on.
- Azure SQL serverless takes up to a minute to resume from auto-pause, so retry the first connection (about 15 attempts, 5 seconds apart) and log each retry as one JSON line without the password.
- Close the pool on SIGTERM.

### 3. Health, demo-user roles and error handling (both services)
- `GET /health` stays shallow: no database query, so health probes never keep Azure SQL serverless awake. Add `GET /health/db` that runs `SELECT 1` and returns 503 when the database is unreachable.
- Demo users only, as decided in ADR-4: a hard-coded list of users with roles (admin, instructor, trainee, company). The UI sends `X-Demo-User: <id>`. An `identify` middleware sets `req.user` (null for a visitor) and rejects unknown ids with 401. A declarative `requireRole('instructor', 'admin')` guard returns 401 without a user and 403 with the wrong role.
- Expose `GET /demo-users` for the UI's switcher and `GET /me`.
- One central error handler. Deliberate errors are an `HttpError` with a status, a safe message and optional field details (400 invalid input, 403, 404). Malformed JSON returns 400. Anything else returns a generic 500 with no stack trace or internal detail, and the real error is logged.
- Fix the request logger so it logs the full path (`/courses/6`, not `/6` after routing) and never the query string or body.

### 4. Courses CRUD (learning service)
- A course has a title, description, type (`module`, `live_class`, `workshop`), credits (0 to 50), pass mark (0 to 100, default 60), instructor id, and a published flag. Create the table and five demo courses as migrations `001` and `002`.
- Rules live in a service with no HTTP or SQL in it: visitors and trainees see published courses only; instructors create courses, list their own with `?mine=true`, and edit or delete only their own; admins see and manage everything; unpublished courses return 404 to people who may not see them.
- Validate input with zod; invalid input returns 400 with the fields that failed. Support `?type=`, `?limit=` (max 100) and `?offset=`.
- A repository port with two adapters: SQL Server (parameterised queries only, `OFFSET ... FETCH` paging, `OUTPUT INSERTED` to return rows) and in-memory (tests, and running without `DATABASE_URL`).
- Thin routes: `GET /courses`, `GET /courses/:id`, `POST /courses` (201 with Location), `PUT /courses/:id`, `DELETE /courses/:id` (204).
- The projects service gets the same foundation (database, migrations, health, demo users, errors) with no feature tables yet.

### 5. Tests
- Cover the migration runner (order, skip applied, checksum mismatch, lock re-check, line endings, batches, bad names, duplicates, missing folder), URL parsing, health, auth, the error handler, course rules and validation, both repositories (the SQL one against a fake executor), and the routes through Supertest.
- Keep at least 70% line coverage on core logic, measured with `--experimental-test-coverage`; exclude only `server.js` and the driver wrapper `db/sql.js`, which are exercised by docker compose and the deployed smoke test.
- Use fakes, not heavy mocking. Test behaviour, including failure paths.

### 6. React UI shell and course pages
- React Router with a layout: header navigation filtered by role, Home (status of both services), catalogue, "My courses" for instructors, course detail, and a create/edit form.
- A demo-user switcher in the header, kept in a small context, remembered in localStorage with every access wrapped in try/catch. Load the user list from the learning service and fall back to the projects service, so it still works when one is down.
- Arabic and English: set `lang` and `dir` on the document, use CSS logical properties, mobile-first layout that works at 360 px, and keep UI strings in one translation file.
- One API client module: an 8 second timeout on every call, the demo-user header, and failures turned into a clear sentence ("The learning service cannot be reached..."), never a crash.
- Every page shows loading, empty and error states. Hide actions the user cannot perform, but rely on the server for security.
- Make reloading a deep link work: `staticwebapp.config.json` for Azure Static Web Apps and an nginx config for docker compose.

### 7. Tooling and docs
- ESLint 9 flat config and Prettier at the repository root, shared by both services and the UI, including React and React hooks rules. Root scripts: `lint`, `format`, `format:check`. Install with Node 24 so lockfiles match CI.
- `.gitattributes` with LF line endings for everyone.
- ADR-5 (migrations on startup, checksums, lock, shallow health check, alternatives considered) and ADR-6 (ports and adapters inside each service), in the existing ADR format: status, context, decision, alternatives, consequences. A data model document with a Mermaid ER diagram matching the migrations.

## Quality bar
- Small functions with guard clauses; no business logic in routes, no SQL in services, no HTTP in the rules.
- Dependencies passed in through factory functions (`createApp`, `createCourseService(repo)`); `server.js` is the only place that wires real adapters.
- No string-built SQL with user input, no secrets in logs or the image, no swallowed errors, no commented-out code.
- Comments explain why, not what.

## Process
1. Read the repo and say what you will change.
2. Implement with tests alongside the code.
3. Verify for real: run both test suites, lint and format checks, `docker compose up` against SQL Server (migrations applied, then skipped on restart), the CRUD flow through the API and the browser, Arabic at phone width, and the UI with the learning service stopped.
4. Report what was built, what you fixed along the way, and anything left out.

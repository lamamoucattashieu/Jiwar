# Decision Records

## ADR-1: Two services, learning and projects

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** The assignment requires exactly two services, each with its own container and database, talking over HTTP. Jiwar has two clearly separate jobs: training youth in coding and AI, and matching them to paid projects from local businesses.
- **Decision:** Split along that line. The **learning** service owns courses and learner progress. The **projects** service owns businesses, project offers and applications. When the projects service needs to know what a learner has completed, it asks the learning service over HTTP (`LEARNING_URL`) instead of reading its database.
- **Alternatives:** One service per user type (youth vs. business), which would split the same data across both services and need many cross-service calls; a single monolith, which the assignment does not allow.
- **Consequences:** Each service can be built, tested and deployed by a sub-team on its own. Calls from projects to learning need a timeout and a clear error when learning is down. Referential integrity across the seam (a learner ID stored in projects) is checked in code, not by a foreign key.

## ADR-2: Node.js (Express) and Azure SQL serverless

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** The backend must be Python (Flask or FastAPI) or Node.js (Express). Storage must be Azure SQL Database serverless on Azure and SQL Server locally.
- **Decision:** Both services use Node.js 24 with Express 5. Each service has its own SQL Server database (`learning`, `projects`) and its own login with access to that database only. Locally one SQL Server container holds both databases, created by the idempotent `db/init.sql`.
- **Alternatives:** FastAPI (Python), which would mean two languages in the repository (Python services, JavaScript UI); a shared database with one schema per service, which the assignment does not allow.
- **Consequences:** One language for the UI and both services, so everyone can review every pull request. Node's built-in test runner gives tests and coverage without extra packages. SQL Server dialect (`INT IDENTITY`, `NVARCHAR`, `OFFSET … FETCH`) must be used in migrations.

## ADR-3: React (Vite) static UI with runtime configuration

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** The UI must be static files on Azure Static Web Apps, calling both services from the browser. Service URLs differ between local and Azure and must not be hardcoded.
- **Decision:** React built with Vite to static files in `ui/`. Service URLs live in `ui/public/config.js` (`window.JIWAR_CONFIG`), loaded before the app. The local file points to `localhost`. On deploy the pipeline overwrites it with the Azure Container Apps URLs. Locally, compose builds the UI once (`ui-build`) and serves it with a stock `nginx:alpine` image, with no Dockerfile.
- **Alternatives:** Plain HTML/JS, which is simpler but harder to grow as the number of pages increases; Vite build-time variables (`import.meta.env`), which would require a rebuild per environment.
- **Consequences:** The same build works everywhere. Each service only accepts cross-origin requests from the UI's origin (`CORS_ORIGIN`).

## ADR-4: Demo users instead of authentication

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** User authentication is out of scope; a hard-coded demo user is enough.
- **Decision:** The product uses a small set of seeded demo users (learners and businesses). The UI lets the presenter pick which demo user to act as.
- **Alternatives:** An optional API key, which protects write endpoints but does not help show both sides of the product in the demo; real authentication, which is out of scope.
- **Consequences:** No passwords or sessions to store or secure. The live system is not fit for real users without adding authentication.

## ADR-5: Versioned SQL migrations, applied on startup, with a shallow health check

- **Status:** Accepted, Sprint 2 (22 Nov 2026)
- **Context:** The schema must come from versioned migration files applied on startup. Azure SQL serverless pauses when idle and needs up to a minute to resume, and it only pauses if nothing queries it.
- **Decision:** Each service has a `migrations/` folder of plain SQL files named `NNN_description.sql`. On startup the service connects (retrying while the database resumes), then applies the files it has not run yet, each in its own transaction, and records them in `schema_migrations` with a SHA-256 checksum. An application lock (`sp_getapplock`) stops two instances migrating at once, for example two revisions during a canary deploy. Editing an applied file stops startup with a clear error. `GET /health` does not touch the database, so health probes do not keep it awake; `GET /health/db` runs `SELECT 1` and is used after a deploy.
- **Alternatives:** An ORM's migration tool (Prisma, Knex), which adds a dependency and its own conventions for a handful of SQL files; running migrations as a separate pipeline step, which would need the pipeline to reach the database directly.
- **Consequences:** Migrations are ordinary SQL Server SQL that anyone can read in a pull request. A mistake in an applied migration is fixed with a new migration, never by editing the old one. The first request after a long idle period is slow while the database resumes.

## ADR-6: Ports and adapters inside each service

- **Status:** Accepted, Sprint 2 (22 Nov 2026)
- **Context:** Business rules (who may edit a course, what a trainee may see) must be testable without SQL Server, and coverage is measured on the core logic.
- **Decision:** Each feature is a module with a service (the rules), a repository port with two adapters (SQL Server for production, in-memory for tests and for running without `DATABASE_URL`), a schema (zod validation) and routes. Express only parses HTTP and calls the service. Errors meant for the user are `HttpError`s; anything else returns a generic 500 with no stack trace.
- **Alternatives:** Queries written directly in route handlers, which is shorter but mixes HTTP, rules and SQL and needs a database for every test.
- **Consequences:** Most tests run in milliseconds with no database. The SQL adapter is checked with a fake executor, and against real SQL Server through `docker compose` and the deployed smoke test. Adding a feature means adding a module, not changing the others.
